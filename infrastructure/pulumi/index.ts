import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Get configuration
const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const projectId = gcpConfig.require("project");
const dnsProjectId = config.require("dnsProjectId");
const domain = config.require("domain");
const subdomain = config.require("subdomain");
const gkeClusterName = config.require("gkeClusterName");
const gkeClusterLocation = config.require("gkeClusterLocation");
const configDnsZoneName = config.get("dnsZoneName") || "scaleops-labs-dev";

// Create provider for DNS project
const dnsProvider = new gcp.Provider("dns-provider", {
    project: dnsProjectId,
});

// Create or reference DNS zone in DNS project
const createDnsZone = config.getBoolean("createDnsZone") ?? true;

let dnsZone: pulumi.Output<gcp.dns.GetManagedZoneResult> | gcp.dns.ManagedZone;

if (createDnsZone) {
    // Create the DNS zone
    const createdZone = new gcp.dns.ManagedZone("dns-zone", {
        name: configDnsZoneName,
        dnsName: `${domain}.`,
        description: `DNS zone for ${domain}`,
        project: dnsProjectId,
    }, { provider: dnsProvider });
    
    dnsZone = createdZone;
} else {
    // Reference existing DNS zone
    dnsZone = pulumi.output(gcp.dns.getManagedZone({
        name: configDnsZoneName,
        project: dnsProjectId,
    }, { provider: dnsProvider, async: true }));
}

// Create service account for external-dns (idempotent - will not error if exists)
const externalDnsServiceAccount = new gcp.serviceaccount.Account("external-dns", {
    accountId: "external-dns",
    displayName: "External DNS for Kubernetes",
    project: projectId,
});

// Grant DNS admin permissions in the DNS project
const dnsAdminBinding = new gcp.projects.IAMMember("external-dns-admin", {
    project: dnsProjectId,
    role: "roles/dns.admin",
    member: pulumi.interpolate`serviceAccount:${externalDnsServiceAccount.email}`,
});

// Get GKE cluster to configure k8s provider
const cluster = pulumi.output(gcp.container.getCluster({
    name: gkeClusterName,
    location: gkeClusterLocation,
    project: projectId,
}));

// Create k8s provider using default kubeconfig
const kubeconfigPaths = process.env.KUBECONFIG 
    ? process.env.KUBECONFIG.split(':').filter(p => p && p.length > 0)
    : [path.join(os.homedir(), '.kube', 'config')];

// Use the first valid kubeconfig file
let kubeconfig: string = '';
for (const configPath of kubeconfigPaths) {
    if (fs.existsSync(configPath)) {
        kubeconfig = fs.readFileSync(configPath, 'utf8');
        break;
    }
}

const k8sProvider = new k8s.Provider("gke-k8s", {
    kubeconfig: kubeconfig,
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
const workloadIdentityBinding = new gcp.serviceaccount.IAMMember("external-dns-workload-identity", {
    serviceAccountId: externalDnsServiceAccount.id,
    role: "roles/iam.workloadIdentityUser",
    member: pulumi.interpolate`serviceAccount:${projectId}.svc.id.goog[${externalDnsNamespace.metadata.name}/${k8sServiceAccount.metadata.name}]`,
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

// Deploy external-dns using Helm chart
const externalDnsChart = new k8s.helm.v3.Chart(
    "external-dns",
    {
        chart: "external-dns",
        version: "8.9.1",
        namespace: externalDnsNamespace.metadata.name,
        fetchOpts: {
            repo: "https://charts.bitnami.com/bitnami",
        },
        values: {
            provider: "google",
            google: {
                project: dnsProjectId,
            },
            serviceAccount: {
                create: false,  // We already created it
                name: k8sServiceAccount.metadata.name,
            },
            domainFilters: [domain],
            sources: ["ingress"],
            policy: "sync",
            txtOwnerId: "meme-generator",
            logLevel: "info",
            resources: {
                limits: {
                    memory: "256Mi",
                },
                requests: {
                    cpu: "100m",
                    memory: "128Mi",
                },
            },
        },
    },
    { provider: k8sProvider, dependsOn: [clusterRoleBinding, workloadIdentityBinding] }
);

// Note: Metrics server is pre-installed on GKE clusters
// No need to deploy it separately

// Deploy nginx-ingress-controller
const nginxIngressNamespace = new k8s.core.v1.Namespace(
    "nginx-ingress",
    {
        metadata: {
            name: "nginx-ingress",
        },
    },
    { provider: k8sProvider }
);

// Create a static IP for the ingress
const ingressIp = new gcp.compute.GlobalAddress("meme-generator-ip", {
    name: "meme-generator-ip",
    project: projectId,
});

const nginxIngressChart = new k8s.helm.v3.Chart(
    "nginx-ingress",
    {
        chart: "ingress-nginx",
        version: "4.8.3",
        namespace: nginxIngressNamespace.metadata.name,
        fetchOpts: {
            repo: "https://kubernetes.github.io/ingress-nginx",
        },
        values: {
            controller: {
                service: {
                    type: "LoadBalancer",
                    loadBalancerIP: ingressIp.address,
                    annotations: {
                        "cloud.google.com/load-balancer-type": "External",
                    },
                },
                config: {
                    "proxy-read-timeout": "3600",
                    "proxy-send-timeout": "3600",
                    "proxy-body-size": "10m",
                    "use-http2": "false", // Disable HTTP/2 for better WebSocket support
                },
                resources: {
                    requests: {
                        cpu: "100m",
                        memory: "256Mi",
                    },
                },
            },
            defaultBackend: {
                enabled: true,
            },
        },
    },
    { provider: k8sProvider, dependsOn: [nginxIngressNamespace, ingressIp] }
);

// Deploy cert-manager for SSL certificates
const certManagerNamespace = new k8s.core.v1.Namespace(
    "cert-manager",
    {
        metadata: {
            name: "cert-manager",
        },
    },
    { provider: k8sProvider }
);

const certManagerChart = new k8s.helm.v3.Chart(
    "cert-manager",
    {
        chart: "cert-manager",
        version: "v1.13.3",
        namespace: certManagerNamespace.metadata.name,
        fetchOpts: {
            repo: "https://charts.jetstack.io",
        },
        values: {
            installCRDs: true,
            global: {
                leaderElection: {
                    namespace: "cert-manager",
                },
            },
        },
    },
    { provider: k8sProvider, dependsOn: [certManagerNamespace] }
);

// Create Let's Encrypt ClusterIssuer
const letsencryptIssuer = new k8s.apiextensions.CustomResource(
    "letsencrypt-prod",
    {
        apiVersion: "cert-manager.io/v1",
        kind: "ClusterIssuer",
        metadata: {
            name: "letsencrypt-prod",
        },
        spec: {
            acme: {
                server: "https://acme-v02.api.letsencrypt.org/directory",
                email: "admin@scaleops.com", // Update with your email
                privateKeySecretRef: {
                    name: "letsencrypt-prod",
                },
                solvers: [{
                    http01: {
                        ingress: {
                            class: "nginx",
                        },
                    },
                }],
            },
        },
    },
    { provider: k8sProvider, dependsOn: [certManagerChart] }
);

// Output important values
export const dnsZoneName = dnsZone instanceof gcp.dns.ManagedZone ? dnsZone.name : pulumi.output(dnsZone).apply(z => z.name);
export const dnsZoneNameServers = dnsZone instanceof gcp.dns.ManagedZone ? dnsZone.nameServers : pulumi.output(dnsZone).apply(z => z.nameServers);
export const externalDnsServiceAccountEmail = externalDnsServiceAccount.email;
export const staticIpAddress = ingressIp.address;
export const staticIpName = ingressIp.name;
export const fullDomain = `${subdomain}.${domain}`;

// Instructions for next steps
export const nextSteps = pulumi.all([dnsZone.nameServers, staticIpAddress, fullDomain, staticIpName]).apply(
    ([ns, ip, fqdn, ipName]) => `
Next Steps:
1. Ensure your domain registrar is pointing to these nameservers:
   ${ns.join("\n   ")}

2. Deploy your application:
   DOMAIN=${domain} skaffold run --profile=gke

3. Your application will be available at:
   https://${fqdn}

4. The static IP (${ip}) will be automatically assigned to your ingress
   if you use the annotation: kubernetes.io/ingress.global-static-ip-name: "${ipName}"

5. Infrastructure includes:
   - External DNS for automatic DNS management
   - Static IP allocation for stable ingress
   - Cross-project IAM for DNS management
   
Note: Metrics Server is pre-installed on GKE clusters
`);