import { fixAsarPath } from './utils';

const sevenBin = require('7zip-bin');
sevenBin.path7za = fixAsarPath(sevenBin.path7za);

const _7z = require('7zip-min');

export const { unpack, pack, list, cmd, getConfig, config } = _7z;
export default _7z;
