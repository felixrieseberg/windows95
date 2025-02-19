export function encode(text: string) {
  // Convert to windows-1252 compatible string by removing unsupported chars
  let result = text.replaceAll(/[^\x00-\xFF]/g, '');

  // If result would be empty, return original
  if (!result.trim()) {
    return text;
  }

  return result;
}

export function getEncoding() {
  return `<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">`;
}
