import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as iam from 'aws-cdk-lib/aws-iam';
import { KubectlV28Layer } from '@aws-cdk/lambda-layer-kubectl-v28';
import { BastionStack } from './bastion';
import { Cluster } from 'aws-cdk-lib/aws-ecs';


interface Context {
  role: string,
  repo: string,
  domain: string,
  certArn: string
}



export class PrivateCluster extends Construct {
  readonly cluster : eks.Cluster;
  private context: Context;

  constructor(scope: Construct, id: string, vpc: ec2.IVpc, myBaston: BastionStack) {
    super(scope, id);
    this.context = this.node.tryGetContext('app');
    
      const iamRole = new iam.Role(this, `${id}-iam-eksCluster`,{
      roleName: `${id}-iam-eksCluster`,
      assumedBy: new iam.AccountRootPrincipal(),
    });

    this.cluster = new eks.Cluster(this, 'Cluster', {
      vpc,
      clusterName: 'dpsEKSCluster',
      defaultCapacity: 1,  
      defaultCapacityInstance: ec2.InstanceType.of(ec2.InstanceClass.M5,ec2.InstanceSize.XLARGE),
      placeClusterHandlerInVpc: true,
      version: eks.KubernetesVersion.V1_28,
      endpointAccess: eks.EndpointAccess.PRIVATE,
      vpcSubnets: [{ 
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED 
      }],
      kubectlEnvironment: {
          // use vpc endpoint, not the global
          "AWS_STS_REGIONAL_ENDPOINTS": 'regional'
      },
      kubectlLayer: new KubectlV28Layer(this, 'kubectl'),
// to get the arn value go to command line and type 'aws sts get-caller-identity'
      mastersRole: iam.Role.fromRoleName(this, 'Master','arn:aws:sts::929556976395:assumed-role/AWSReservedSSO_AWSAdministratorAccess_d4aeae66894d98fe/david.stripeik@stls.frb.org' )
    });

    const clusterRole = new iam.Role(this, 'EksClusterRole',{
      assumedBy: new iam.ServicePrincipal('eks.amazonaws.com')
    });

    clusterRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'));
    clusterRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSServicePolicy'));
    this.cluster.awsAuth.addMastersRole(clusterRole);

    const bastionRole = new iam.Role(this, 'BastionRole',{
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });

    bastionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSClusterPolicy'));
    bastionRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKSServicePolicy'));
    this.cluster.awsAuth.addMastersRole(bastionRole);


//     //my issue is how to assign the master role to my AWS role
    const role1 = iam.Role.fromRoleName(this, 'admin-role', 'arn:us-east-1:iam::9295569763955:role/AWSReservedSSO_AWSAdministratorAccess_d4aeae66894d98fe');
    const role2 =  iam.Role.fromRoleName(this, 'mastersroleblankstack2', myBaston.host.role.roleName); 
    this.cluster.awsAuth.addRoleMapping(role1, {groups:['system:masters']});
    this.cluster.awsAuth.addRoleMapping(role2, {groups:['system:masters']});
    this.cluster.awsAuth.addMastersRole(iam.Role.fromRoleName(this, 'mastersroleblankstack', myBaston.host.role.roleName))
    this.cluster.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'));

    this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.0.0.0/8'),ec2.Port.tcp(443), 'runner');
    this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.179.253.0/24'),ec2.Port.tcp(443), 'runner');
    this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('198.18.0.0/22'),ec2.Port.tcp(443), 'runner');
    this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.0.0.0/8'),ec2.Port.tcp(80), 'runner');
    this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('10.179.253.0/24'),ec2.Port.tcp(80), 'runner');
    this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('198.18.0.0/22'),ec2.Port.tcp(80), 'runner');
    this.cluster.clusterSecurityGroup.addIngressRule(ec2.Peer.ipv4('198.18.0.0/22'),ec2.Port.tcp(80), 'runner');

    //addons
    const kubeProxy = new eks.CfnAddon(this, 'addonKubeProxy',{
      addonName: "kube-proxy",
      clusterName: this.cluster.clusterName,
    });
    const coreDNS = new eks.CfnAddon(this, 'addoncoreDNS',{
      addonName: "coredns",
      clusterName: this.cluster.clusterName,
    });
    const vpcCni = new eks.CfnAddon(this, 'addonVpcCni',{
      addonName: "vpc-cni",
      clusterName: this.cluster.clusterName,
    });
    this.cluster.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEKS_CNI_Policy'));
    const policy = iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryReadOnly');
    this.cluster.defaultNodegroup?.role.addManagedPolicy(policy);
  }
}