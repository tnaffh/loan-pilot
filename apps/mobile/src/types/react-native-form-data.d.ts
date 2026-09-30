/**
 * React Native's FormData accepts a file descriptor object (a local `uri` plus
 * its name and MIME type) and streams the file itself; the DOM typings only
 * know strings and Blobs.
 */
interface ReactNativeFormDataFile {
  uri: string;
  name: string;
  type: string;
}

interface FormData {
  append(name: string, value: ReactNativeFormDataFile): void;
}
