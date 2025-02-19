import { Stats } from "fs";
import { settings } from "../settings";
import { FileEntry } from "./fileserver";

const FILES_TO_HIDE_ON_DARWIN: string[] = [
  '.DS_Store',
  '.localized',
  '.Trashes',
  '.fseventsd',
  '.Spotlight-V100',
  '.file',
  '.hotfiles.btree',
  '.DocumentRevisions-V100',
  '.TemporaryItems',
  '.file (resource fork files)',
  '.VolumeIcon.icns',
];

const FILES_TO_HIDE_ON_WINDOWS: string[] = [
  'desktop.ini',
  'Thumbs.db',
  'ehthumbs.db',
  'ehthumbs.db-shm',
  'ehthumbs.db-wal',
];

const FILES_TO_HIDE_ON_LINUX: string[] = [];

export function shouldHideFile(file: FileEntry) {
  if (isHiddenFile(file) && !settings.get('isFileServerShowingHiddenFiles')) {
    return true;
  }

  if (isSystemHiddenFile(file) && !settings.get('isFileServerShowingSystemHiddenFiles')) {
    return true;
  }

  return false;
}

export function isHiddenFile(file: FileEntry) {
  if (process.platform === 'win32') {
    return (file.stats.mode & 0x2) === 0x2;
  } else {
    return file.name.startsWith('.');
  }
}

export function isSystemHiddenFile(file: FileEntry) {
  return getFilesToHide().some(hiddenFile => file.name.endsWith(hiddenFile));
}

let _filesToHide: string[];

function getFilesToHide() {
  if (_filesToHide) {
    return _filesToHide;
  }

  if (process.platform === 'darwin') {
    _filesToHide = FILES_TO_HIDE_ON_DARWIN;
  } else if (process.platform === 'win32') {
    _filesToHide = FILES_TO_HIDE_ON_WINDOWS;
  } else {
    _filesToHide = FILES_TO_HIDE_ON_LINUX;
  }

  return _filesToHide;
}



