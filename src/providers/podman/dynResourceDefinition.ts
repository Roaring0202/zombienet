import { genCmd } from "../../cmdGenerator";
import {
  PROMETHEUS_PORT,
  FINISH_MAGIC_FILE,
  TRANSFER_CONTAINER_NAME,
  getUniqueName,
  RPC_HTTP_PORT,
  P2P_PORT,
} from "../../configManager";
import { Node } from "../../types";
import { getRandomPort } from "../../utils";
import { getClient } from "../client";

const fs = require("fs").promises;

export async function genBootnodeDef(
  namespace: string,
  nodeSetup: Node
): Promise<any> {
  const [volume_mounts, devices] = await make_volume_mounts(nodeSetup.name);
  const container = await make_main_container(nodeSetup, volume_mounts);
  const transferContainter = make_transfer_containter();
  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: "bootnode",
      namespace: namespace,
      labels: {
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": "bootnode",
        "zombie-role": "bootnode",
        app: "zombienet",
        "zombie-ns": namespace,
      },
    },
    spec: {
      hostname: "bootnode",
      containers: [container],
      initContainers: nodeSetup.initContainers?.concat([
        transferContainter,
      ]) || [transferContainter],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

export async function genNodeDef(
  namespace: string,
  nodeSetup: Node
): Promise<any> {
  const [volume_mounts, devices] = await make_volume_mounts(nodeSetup.name);
  const container = await make_main_container(nodeSetup, volume_mounts);
  const transferContainter = make_transfer_containter();

  return {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: nodeSetup.name,
      namespace: namespace,
      labels: {
        "zombie-role": nodeSetup.validator ? "authority" : "full-node",
        app: "zombienet",
        "zombie-ns": namespace,
        "app.kubernetes.io/name": namespace,
        "app.kubernetes.io/instance": nodeSetup.name,
      },
      annotations: {
        "prometheus.io/scrape": "true",
        "prometheus.io/port": PROMETHEUS_PORT + "", //force string
      },
    },
    spec: {
      hostname: nodeSetup.name,
      containers: [container],
      initContainers: nodeSetup.initContainers?.concat([
        transferContainter,
      ]) || [transferContainter],
      restartPolicy: "OnFailure",
      volumes: devices,
    },
  };
}

function make_transfer_containter(): any {
  return {
    name: TRANSFER_CONTAINER_NAME,
    image: "docker.io/alpine",
    imagePullPolicy: "Always",
    volumeMounts: [{ name: "tmp-cfg", mountPath: "/cfg", readOnly: false }],
    command: [
      "ash",
      "-c",
      `until [ -f ${FINISH_MAGIC_FILE} ]; do echo waiting for tar to finish; sleep 1; done; echo copy files has finished`,
    ],
  };
}
async function make_volume_mounts(name: string): Promise<[any, any]> {
  const volume_mounts = [
    { name: "tmp-cfg", mountPath: "/cfg", readOnly: false },
    { name: "tmp-z", mountPath: "/z", readOnly: false },
  ];

  const client = getClient();
  const cfgPath = `${client.tmpDir}/${name}/cfg`;
  const zPath = `${client.tmpDir}/${name}/z`;
  await fs.mkdir(cfgPath, { recursive: true });
  await fs.mkdir(zPath, { recursive: true });

  const devices = [
    { name: "tmp-cfg", hostPath: { type: "Directory", path: cfgPath } },
    { name: "tmp-z", hostPath: { type: "Directory", path: zPath } },
  ];

  return [volume_mounts, devices];
}

async function make_main_container(
  nodeSetup: Node,
  volume_mounts: any[]
): Promise<any> {
  const ports = [
    {
      containerPort: PROMETHEUS_PORT,
      name: "prometheus",
      hostPort: await getRandomPort(),
    },
    {
      containerPort: RPC_HTTP_PORT,
      name: "rpc",
      hostPort: await getRandomPort(),
    },
    { containerPort: P2P_PORT, name: "p2p", hostPort: await getRandomPort() },
  ];
  const command = await genCmd(nodeSetup);

  let containerDef = {
    image: nodeSetup.image,
    name: nodeSetup.name,
    imagePullPolicy: "Always",
    ports,
    env: nodeSetup.env,
    volumeMounts: volume_mounts,
    command,
  };

  return containerDef;
}

export function createTempNodeDef(
  name: string,
  image: string,
  chain: string,
  fullCommand: string
) {
  let node: Node = {
    name: getUniqueName("temp"),
    image,
    fullCommand: fullCommand,
    chain,
    validator: false,
    bootnodes: [],
    args: [],
    env: [],
    telemetryUrl: "",
    overrides: [],
  };

  return node;
}
