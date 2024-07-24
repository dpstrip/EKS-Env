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
      vpcId: 'vpc-08b4163ec288bd766',
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
      endpointAccess: eks.EndpointAccess.PRIVATE,
      vpcSubnets: [{ 
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED 
      }],
    });

    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.0.0.0/8'),ec2.Port.tcp(443), 'runner');
    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.179.253.0/24'),ec2.Port.tcp(443), 'runner');
    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('198.18.0.0/22'),ec2.Port.tcp(443), 'runner');
    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.0.0.0/8'),ec2.Port.tcp(80), 'runner');
    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.179.253.0/24'),ec2.Port.tcp(80), 'runner');
    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('198.18.0.0/22'),ec2.Port.tcp(80), 'runner');
    cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('198.18.0.0/22'),ec2.Port.tcp(80), 'runner');

    // Add EKS addons
    const kubeProxy = new eks.CfnAddon(this, 'addonKubeProxy',{
            addonName: "kube-proxy",
            clusterName: cluster.clusterName,
          });
          const coreDNS = new eks.CfnAddon(this, 'addoncoreDNS',{
            addonName: "coredns",
            clusterName: cluster.clusterName,
          });
          const vpcCni = new eks.CfnAddon(this, 'addonVpcCni',{
            addonName: "vpc-cni",
            clusterName: cluster.clusterName,
          });

    // Create OIDC provider for the EKS cluster
    // const oidcProvider = new eks.OpenIdConnectProvider(this, 'OIDCProvider', {
    //   cluster,
    // });

//assets to be deployed

const asset = new assets.Asset(this, 'S3Asset', {
  path: 'assets/kubectl'
});

const userData = ec2.UserData.forLinux();
userData.addS3DownloadCommand({
  bucket: asset.bucket,
  bucketKey: asset.s3ObjectKey,
  localFile: '/tmp/kubectl'
});
userData.addCommands(
  'chmod +x /tmp/kubectl',
  'cp /tmp/kubectl /usr/local/bin'
);

const securityGroup = new ec2.SecurityGroup(this, 'web-server-sg', {
  vpc,
  allowAllOutbound: true,
  description: 'security group for a web server',
});

securityGroup.addIngressRule(
  ec2.Peer.ipv4('3.83.200.219/32'),
  ec2.Port.tcp(22),
);

securityGroup.addIngressRule(
  ec2.Peer.ipv4('3.83.200.219/32'),
  ec2.Port.tcp(80),
);
securityGroup.addIngressRule(
  ec2.Peer.ipv4('3.83.200.219/32'),
  ec2.Port.tcp(443),
);
securityGroup.addIngressRule(
  ec2.Peer.ipv4('10.0.0.0/8'),
  ec2.Port.tcp(443),
);

    // Bastion host setup
    const bastion = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      securityGroup,
      machineImage: ec2.MachineImage.latestAmazonLinux2023 ({
        userData,
        })
    });

    // Asset to deploy kubectl binary
    const kubectlAsset = new assets.Asset(this, 'KubectlAsset', {
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
   
  

    // Allow Bastion host to connect to EKS cluster
    cluster.awsAuth.addMastersRole(bastionRole);

    bastion.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
    bastion.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // Outputs
    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
    });

    new cdk.CfnOutput(this, 'BastionHostPublicDNS', {
      value: bastion.instancePublicDnsName,
    });

  }
}
