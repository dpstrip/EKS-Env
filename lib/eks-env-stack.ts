import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as assets from 'aws-cdk-lib/aws-s3-assets';

export class EksEnvStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    let  sVpcid: string;
    sVpcid = "vpc-08b4163ec288bd766cdk synth";

     //get VPC object 
    const vpc = ec2.Vpc.fromLookup(this, 'VPC', {vpcId: sVpcid});

    //Create iam role
    const clusterAdmin = new iam.Role(this, 'AdminRole', {
      assumedBy: new iam.AccountRootPrincipal(),
    });

    const cluster = new eks.Cluster(this, 'eksCluster',{
      vpc,
      mastersRole: clusterAdmin,
      defaultCapacity: 2,
      defaultCapacityInstance: new ec2.InstanceType('t3.small'),
      version: eks.KubernetesVersion.V1_30,
      endpointAccess: eks.EndpointAccess.PRIVATE,
      vpcSubnets: [{ 
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED 
      }], 
    });

    //add ons
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

          ////create new policy
          const policy = new iam.PolicyStatement({
            actions:['esk:*'],
            resources: ['*']
          });

          clusterAdmin.addToPolicy(policy);

          //create Bastion host
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
        
          
  const host = new ec2.BastionHostLinux(this, 'Bastion', { 
            vpc,
            requireImdsv2: true,
            machineImage: ec2.MachineImage.latestAmazonLinux2023 ({
            userData,
            //generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
            })
          });
        
   host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
   host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
        


  }
}
