export interface CliOptions {
  port: number;
  appPort: number;
  workspace: string;
  silent: boolean;
  verbose: boolean;
  frameworks?: string[];
  host?: string;
}

export interface FrameworkDetector {
  detect(workspace: string): Promise<string[]>;
}