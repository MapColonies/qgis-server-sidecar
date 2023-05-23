# qgis-server-sidecar

This is a sidecar container to load QGIS Server data from S3

## Run
```
docker image build -t qgis-server-sidecar:v1.0.8 .
```
```
docker container run --rm --name qgis-server-sidecar \
      --network host \
      -e POLLING_INTERVAL=60000 \
      -e LOG_LEVEL=info \
      -e AWS_ACCESS_KEY_ID=raster \
      -e AWS_SECRET_ACCESS_KEY=rasterPassword \
      -e AWS_ENDPOINT_URL=http://10.8.0.9:9000 \
      -e AWS_BUCKET_NAME=dem-int \
      -e RAW_DATA_PROXY_URL=https://dem-int-proxy-production-nginx-s3-gateway-route-integration.apps.j1lk3njp.eastus.aroapp.io \
      -e ENTITIES='["dtm","dsm"]' \
      -v /docker/qgis/data:/io/data \
      qgis-server-sidecar:v1.0.8 -d
```
```
docker container exec -it qgis-server-sidecar /bin/bash
```
```
docker container stop qgis-server-sidecar
```
```
AWS_ENDPOINT_URL=http://10.8.0.9:9000 AWS_BUCKET_NAME=dem-int RAW_DATA_PROXY_URL=https://dem-int-proxy-production-nginx-s3-gateway-route-integration.apps.j1lk3njp.eastus.aroapp.io ENTITIES='["dtm","dsm"]' npx zx script.mjs
```