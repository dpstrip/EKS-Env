import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as assets from 'aws-cdk-lib/aws-s3-assets';

export class EksEnvStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
   // Lookup existing VPC
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {
      vpcId: props.vpcId,
    });

    // Create IAM role for EKS cluster
    const clusterAdminRole = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.AccountRootPrincipal(),
    });

    // Create the EKS cluster
    const cluster = new eks.Cluster(this, 'Cluster', {
      vpc,
      defaultCapacity: 1, // number of nodes
      defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO), // small server
      mastersRole: clusterAdminRole,
      version: eks.KubernetesVersion.V1_30,
    });

    // Add EKS addons
    cluster.addCniAddOn();
    cluster.addCoreDnsAddOn();
    cluster.addKubeProxyAddOn();

    // Create OIDC provider for the EKS cluster
    const oidcProvider = new eks.OpenIdConnectProvider(this, 'OIDCProvider', {
      cluster,
    });

    // Bastion host setup
    const bastion = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      instanceType: new ec2.InstanceType('t3.micro'),
    });

    // Asset to deploy kubectl binary
    const kubectlAsset = new s3assets.Asset(this, 'KubectlAsset', {
      path: './assets/kubectl', // assuming kubectl binary is in the assets directory
    });

    // Setup IAM role for Bastion host to access EKS cluster
    const bastionRole = new iam.Role(this, 'BastionRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });

    bastionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy')
    );
    bastionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSWorkerNodePolicy')
    );
    bastionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly')
    );

    // Attach the role to the bastion host
    bastion.instance.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['eks:*'],
        resources: ['*'],
      })
    );

    // Add user data to Bastion host to download kubectl
    bastion.instance.userData.addS3DownloadCommand({
      bucket: kubectlAsset.bucket,
      bucketKey: kubectlAsset.s3ObjectKey,
      localFile: '/usr/local/bin/kubectl',
    });

    bastion.instance.userData.addExecuteFileCommand({
      filePath: '/usr/local/bin/kubectl',
      arguments: '--version', // to verify installation
    });

    // Allow Bastion host to connect to EKS cluster
    cluster.awsAuth.addMastersRole(bastionRole);

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
    });

    new cdk.CfnOutput(this, 'BastionHostPublicDNS', {
      value: bastion.instancePublicDnsName,
    });

  }
}
