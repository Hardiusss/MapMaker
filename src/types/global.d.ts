export interface AetheriaBridge {
  isDesktop: true;
  saveDialog(opts: { title?: string; defaultPath?: string; defaultName?: string; filters?: { name: string; extensions: string[] }[] }): Promise<string | null>;
  openDialog(opts: { title?: string; multi?: boolean; filters?: { name: string; extensions: string[] }[] }): Promise<string[]>;
  writeBinary(filePath: string, base64: string): Promise<boolean>;
  writeText(filePath: string, text: string): Promise<boolean>;
  readBinary(filePath: string): Promise<string>;
  readText(filePath: string): Promise<string>;
  exists(filePath: string): Promise<boolean>;
  recentPush(filePath: string): Promise<boolean>;
  recentList(): Promise<string[]>;
  getPrefs(): Promise<Record<string, unknown>>;
  setPrefs(prefs: Record<string, unknown>): Promise<boolean>;
  info(): Promise<{
    version: string; platform: string; arch: string; electron: string;
    chrome: string; node: string; userData: string; documents: string; pictures: string; home: string;
  }>;
  showItemInFolder(filePath: string): Promise<boolean>;
  setTitle(title: string): Promise<boolean>;
  onMenu(handler: (payload: MenuPayload) => void): () => void;
}

export interface MenuPayload {
  command: string;
  format?: string;
  kind?: string;
  path?: string;
}

declare global {
  interface Window {
    aetheria?: AetheriaBridge;
  }
}

export {};
