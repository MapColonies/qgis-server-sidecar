#!/usr/bin/env zx

import jsLogger from '@map-colonies/js-logger';
import crypto from 'crypto';

const DATA_DIR = '/io/data';
const CURRENT_STATE_FILE = path.join(DATA_DIR, 'state.json');

const pollingInterval = +(process.env.POLLING_INTERVAL ?? 1000); // in milliseconds
const logger = jsLogger.default({ level: process.env.LOG_LEVEL ?? 'info' }); // ['debug', 'info', 'warn', 'error', 'fatal']
const productTypes = JSON.parse(process.env.PRODUCT_TYPES ?? '[]') ?? ['dtm','dsm'];
logger.debug({ productTypes });

$.shell = '/bin/bash';
$.verbose = false;

const parse = (state) => state.reduce((parsedState, project) => {
  const { key, size, lastModified } = project;
  return ({
    ...parsedState,
    [key]: {
      size,
      lastModified
    }
  });
}, {});

const generateChecksum = (str, algorithm, encoding) => {
  return crypto
    .createHash(algorithm || 'md5')
    .update(str, 'utf8')
    .digest(encoding || 'hex');
};

const getRemoteState = async (prefix) => {
  const args = [
    `list-objects`,
    `--endpoint-url`,
    process.env.AWS_ENDPOINT_URL,
    `--bucket`,
    process.env.AWS_BUCKET_NAME,
    `--prefix`,
    prefix,
    `--query`,
    `Contents[?contains(@.Key, \`qgs\`) == \`true\`].{key: Key, size: Size, lastModified: LastModified}`
  ];
  return $`aws s3api ${args}`;
};

const deleteProject = async (project) => {
  return $`rm -rf ${path.join(DATA_DIR, project, '..', '..')}`;
};

const syncProject = async (projectPath) => {
  const projectDir = path.join(projectPath, '..');
  const args = [
    `cp`,
    `--endpoint-url`,
    process.env.AWS_ENDPOINT_URL,
    `s3://${process.env.AWS_BUCKET_NAME}/${projectDir}`,
    `${DATA_DIR}/${projectDir}`,
    `--recursive`
  ]
  return $`aws s3 ${args}`;
};

const syncDataDir = async () => {

  try {
    logger.debug({ msg: 'Getting state from storage', bucket: process.env.AWS_BUCKET_NAME });
    const remoteState = [];
    for (let i = 0; i < productTypes.length; i++) {
      const productTypeState = (await getRemoteState(productTypes[i])).stdout.trim();
      remoteState.push(...JSON.parse(productTypeState));
    }
    const parsedRemoteState = parse(remoteState);
    logger.debug({ parsedRemoteState });

    let currentState = '{}';
    if (fs.existsSync(CURRENT_STATE_FILE)) {
      currentState = (await $`cat ${CURRENT_STATE_FILE}`).stdout.trim();
      logger.debug({ currentState });
    }
    const parsedCurrentState = JSON.parse(currentState);
    logger.debug({ parsedCurrentState });

    if (generateChecksum(JSON.stringify(parsedRemoteState)) === generateChecksum(JSON.stringify(parsedCurrentState))) {
      logger.info({ msg: 'Data unchanged' });
      return;
    }

    const remoteStateKeys = Object.keys(parsedRemoteState);
    const currentStateKeys = Object.keys(parsedCurrentState);

    const toDelete = currentStateKeys.filter(proj => !remoteStateKeys.includes(proj));
    logger.debug({ toDelete });
    const toUpdate = remoteStateKeys.filter(proj => currentStateKeys.includes(proj) && parsedCurrentState[proj].lastModified !== parsedRemoteState[proj].lastModified);
    logger.debug({ toUpdate });
    const toAdd = remoteStateKeys.filter(proj => !currentStateKeys.includes(proj));
    logger.debug({ toAdd });
    const toSync = [ ...toUpdate, ...toAdd ];
    logger.debug({ toSync });

    if (toDelete.length) {
      // When we want to delete some product QGIS related data, then whole product data folder will be deleted
      // Folder structure is as following:
      // /io/data/[product_type]/[product_id]/{project | data | style}/[product_id].qgs
      await Promise.all(toDelete.map(projectToDelete => deleteProject(projectToDelete)));
      toDelete.forEach(projectToDelete => logger.info({ msg: 'Deleted', project: projectToDelete }));
    }

    if (toSync.length) {
      await Promise.all(toSync.map(async (projectToSync) => {
        return new Promise(async (resolve, reject) => {
          await deleteProject(projectToSync);
          let syncStatus;
          try {
            syncStatus = await syncProject(projectToSync);
          } catch (e) {
            const errorMsg = e.stderr?.trim();
            if (!errorMsg?.includes('warning:')) {
              logger.error({ ERROR: errorMsg, project: projectToSync });
              reject('Cannot copy from S3');
            } else {
              logger.debug({ msg: errorMsg });
              syncStatus = e;
            }
          }
          if (syncStatus?.stdout.trim().includes('download:')) {
            try {
              if (fs.existsSync(path.join(DATA_DIR, projectToSync))) {
                await $`sed -i 's,{AWS_BUCKET_NAME},${process.env.AWS_BUCKET_NAME},g; s,{RAW_DATA_PROXY_URL},${process.env.RAW_DATA_PROXY_URL},g' ${DATA_DIR}/${projectToSync}`;
                logger.info({ msg: 'Synced', project: projectToSync });
                resolve();
              } else {
                logger.error({ ERROR: 'not found', project: `${DATA_DIR}/${projectToSync}` });
                reject('Project was not copied from S3');
              }
            } catch (e) {
              logger.error({ ERROR: e.stderr?.trim() ?? 'Failed to run sed', project: projectToSync });
              reject('Cannot replace urls inside the new downloaded project');
            }
          }
        });
      }));
    }
    
    await fs.writeFile(CURRENT_STATE_FILE, JSON.stringify(parsedRemoteState, null, 2), { flag: 'w+' });
    logger.info({ msg: 'Updated new state' });
    logger.debug({ newState: parsedRemoteState });
  } catch (error) {
    logger.error({ msg: error });
  }

};


while (true) {

  await syncDataDir();

  logger.debug({ msg: 'Sleeping for polling interval', interval: pollingInterval });

  await sleep(pollingInterval);

}
