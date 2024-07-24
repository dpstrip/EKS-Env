import { StackProps } from 'aws-cdk-lib';
import * as ec2 from'aws-cdk-lib/aws-ec2';
import * as iam from'aws-cdk-lib/aws-iam';
import * as s3Assets from'aws-cdk-lib/aws-s3-assets';
import {Construct} from 'constructs';

export class BastionStack extends Construct {
    readonly host: ec2.BastionHostLinux;

    constructor(scope: Construct, id: string,myVPCid: string, props?: StackProps){
        super(scope, id);

        //get vpc
        const vpc = ec2.Vpc.fromLookup(this, 'vpc', {
            vpcId: myVPCid,
          });

         /******************************************************/
  /*** Create the bastion server                    *****/
  /******************************************************/
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
  
  
  //trying to get access into server
     [
        ec2.InterfaceVpcEndpointAwsService.AUTOSCALING,
        ec2.InterfaceVpcEndpointAwsService.CLOUDFORMATION,
        ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,      
        ec2.InterfaceVpcEndpointAwsService.ECR,
        ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
        ec2.InterfaceVpcEndpointAwsService.ELASTIC_LOAD_BALANCING,
        ec2.InterfaceVpcEndpointAwsService.KMS,
        ec2.InterfaceVpcEndpointAwsService.LAMBDA,
        ec2.InterfaceVpcEndpointAwsService.STEP_FUNCTIONS,
        ec2.InterfaceVpcEndpointAwsService.STS,
       
     ec2.InterfaceVpcEndpointAwsService.EC2,
     ec2.InterfaceVpcEndpointAwsService.SSM,
     ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
     ec2.InterfaceVpcEndpointAwsService.EC2_MESSAGES
     ].forEach(e=> vpc.addInterfaceEndpoint(e.shortName,{service: e, securityGroups:[securityGroup]}));
     
  
  
  
    const asset = new s3Assets.Asset(this, 'S3Asset', {
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

  
   this.host = new ec2.BastionHostLinux(this, 'Bastion', { 
    vpc,
    requireImdsv2: true,
    securityGroup,
    machineImage: ec2.MachineImage.latestAmazonLinux2023 ({
    userData,
    //generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2
    })
  });

  this.host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
  this.host.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
}
}