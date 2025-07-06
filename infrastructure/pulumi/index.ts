import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";

// Get configuration
const config = new pulumi.Config();
const projectId = config.require("gcp:project");
const domain = config.require("domain");
const subdomain = config.require("subdomain");
const gkeClusterName = config.require("gkeClusterName");
const gkeClusterLocation = config.require("gkeClusterLocation");
const createDnsZone = config.getBoolean("createDnsZone") ?? false;

// Create or reference DNS zone
let dnsZone: gcp.dns.ManagedZone;
if (createDnsZone) {
    dnsZone = new gcp.dns.ManagedZone("meme-generator-zone", {
        name: "meme-generator-zone",
        dnsName: `${domain}.`,
        description: "DNS zone for meme generator application",
    });
} else {
    // Reference existing zone
    dnsZone = gcp.dns.ManagedZone.get("meme-generator-zone", "meme-generator-zone");
}

// Create service account for external-dns
const externalDnsServiceAccount = new gcp.serviceaccount.Account("external-dns", {
    accountId: "external-dns",
    displayName: "External DNS for Kubernetes",
    project: projectId,
});

// Grant DNS admin permissions
const dnsAdminBinding = new gcp.projects.IAMBinding("external-dns-admin", {
    project: projectId,
    role: "roles/dns.admin",
    members: [pulumi.interpolate`serviceAccount:${externalDnsServiceAccount.email}`],
});

// Get GKE cluster to configure k8s provider
const cluster = gcp.container.getCluster({
    name: gkeClusterName,
    location: gkeClusterLocation,
    project: projectId,
});

// Create k8s provider using cluster credentials
const k8sProvider = new k8s.Provider("gke-k8s", {
    kubeconfig: pulumi.all([cluster.name, cluster.endpoint, cluster.masterAuth]).apply(
        ([name, endpoint, masterAuth]) => {
            const context = `${projectId}_${gkeClusterLocation}_${name}`;
            return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${masterAuth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1beta1
      command: gcloud
      args:
      - container
      - clusters
      - get-credentials
      - ${name}
      - --location=${gkeClusterLocation}
      - --project=${projectId}
      interactiveMode: IfAvailable
      provideClusterInfo: true`;
        }
    ),
});

// Create namespace for external-dns
const externalDnsNamespace = new k8s.core.v1.Namespace(
    "external-dns",
    {
        metadata: {
            name: "external-dns",
        },
    },
    { provider: k8sProvider }
);

// Create Kubernetes service account
const k8sServiceAccount = new k8s.core.v1.ServiceAccount(
    "external-dns",
    {
        metadata: {
            name: "external-dns",
            namespace: externalDnsNamespace.metadata.name,
            annotations: {
                "iam.gke.io/gcp-service-account": externalDnsServiceAccount.email,
            },
        },
    },
    { provider: k8sProvider }
);

// Create Workload Identity binding
const workloadIdentityBinding = new gcp.serviceaccount.IAMBinding("external-dns-workload-identity", {
    serviceAccountId: externalDnsServiceAccount.id,
    role: "roles/iam.workloadIdentityUser",
    members: [
        pulumi.interpolate`serviceAccount:${projectId}.svc.id.goog[${externalDnsNamespace.metadata.name}/${k8sServiceAccount.metadata.name}]`,
    ],
});

// Create ClusterRole for external-dns
const clusterRole = new k8s.rbac.v1.ClusterRole(
    "external-dns",
    {
        metadata: {
            name: "external-dns",
        },
        rules: [
            {
                apiGroups: [""],
                resources: ["services", "endpoints", "pods"],
                verbs: ["get", "watch", "list"],
            },
            {
                apiGroups: ["extensions", "networking.k8s.io"],
                resources: ["ingresses"],
                verbs: ["get", "watch", "list"],
            },
            {
                apiGroups: [""],
                resources: ["nodes"],
                verbs: ["list", "watch"],
            },
        ],
    },
    { provider: k8sProvider }
);

// Create ClusterRoleBinding
const clusterRoleBinding = new k8s.rbac.v1.ClusterRoleBinding(
    "external-dns",
    {
        metadata: {
            name: "external-dns",
        },
        roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: clusterRole.metadata.name,
        },
        subjects: [
            {
                kind: "ServiceAccount",
                name: k8sServiceAccount.metadata.name,
                namespace: externalDnsNamespace.metadata.name,
            },
        ],
    },
    { provider: k8sProvider }
);

// Deploy external-dns
const externalDnsDeployment = new k8s.apps.v1.Deployment(
    "external-dns",
    {
        metadata: {
            name: "external-dns",
            namespace: externalDnsNamespace.metadata.name,
        },
        spec: {
            strategy: {
                type: "Recreate",
            },
            selector: {
                matchLabels: {
                    app: "external-dns",
                },
            },
            template: {
                metadata: {
                    labels: {
                        app: "external-dns",
                    },
                },
                spec: {
                    serviceAccountName: k8sServiceAccount.metadata.name,
                    containers: [
                        {
                            name: "external-dns",
                            image: "registry.k8s.io/external-dns/external-dns:v0.14.0",
                            args: [
                                "--source=service",
                                "--source=ingress",
                                `--domain-filter=${domain}`,
                                "--provider=google",
                                `--google-project=${projectId}`,
                                "--registry=txt",
                                `--txt-owner-id=meme-generator`,
                                "--log-level=info",
                                "--policy=sync",
                            ],
                            env: [
                                {
                                    name: "GOOGLE_APPLICATION_CREDENTIALS",
                                    value: "/var/run/secrets/cloud.google.com/service-account.json",
                                },
                            ],
                            resources: {
                                limits: {
                                    memory: "256Mi",
                                },
                                requests: {
                                    cpu: "100m",
                                    memory: "128Mi",
                                },
                            },
                            securityContext: {
                                runAsNonRoot: true,
                                runAsUser: 65534,
                                readOnlyRootFilesystem: true,
                                capabilities: {
                                    drop: ["ALL"],
                                },
                            },
                        },
                    ],
                },
            },
        },
    },
    { provider: k8sProvider, dependsOn: [clusterRoleBinding, workloadIdentityBinding] }
);

// Create a static IP for the ingress (optional but recommended)
const ingressIp = new gcp.compute.GlobalAddress("meme-generator-ip", {
    name: "meme-generator-ip",
    project: projectId,
});

// Output important values
export const nameservers = dnsZone.nameServers;
export const externalDnsServiceAccountEmail = externalDnsServiceAccount.email;
export const staticIpAddress = ingressIp.address;
export const staticIpName = ingressIp.name;
export const fullDomain = `${subdomain}.${domain}`;

// Instructions for next steps
export const nextSteps = pulumi.all([nameservers, staticIpAddress, fullDomain]).apply(
    ([ns, ip, fqdn]) => `
Next Steps:
1. Ensure your domain registrar is pointing to these nameservers:
   ${ns.join("\n   ")}

2. Update your GKE ingress to use the static IP:
   annotations:
     kubernetes.io/ingress.global-static-ip-name: "${ingressIp.name}"

3. Deploy your application:
   DOMAIN=${domain} skaffold run --profile=gke

4. Your application will be available at:
   https://${fqdn}
`
);