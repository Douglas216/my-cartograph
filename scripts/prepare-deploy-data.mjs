import { access, mkdir } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

const output = resolve('public/geo/admin1.geojson');
const packed = resolve('data/packed/admin1.geojson.gz');

try {
  await access(output);
} catch {
  await mkdir(dirname(output), { recursive: true });
  await pipeline(createReadStream(packed), createGunzip(), createWriteStream(output));
}
