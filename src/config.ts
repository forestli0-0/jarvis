import * as fs from 'fs';
import * as path from 'path';

export interface ModelConfig {
  provider: 'openai-compatible' | 'mimo' | 'custom';
  base_url: string;
  api_key: string;
  model_name: string;
}

export interface ServerConfig {
  port: number;
}

export interface SearchConfig {
  provider: 'tavily' | 'serper' | 'bing';
  api_key?: string;
}

export interface JarvisConfig {
  model: ModelConfig;
  server: ServerConfig;
  workspace: string;
  search?: SearchConfig;
}

const CONFIG_PATH = path.join(process.cwd(), 'jarvis.config.json');

const DEFAULT_CONFIG: JarvisConfig = {
  model: {
    provider: 'openai-compatible',
    base_url: 'https://api.openai.com/v1',
    api_key: '',
    model_name: 'mimo-v2.5-pro',
  },
  server: {
    port: 3000,
  },
  workspace: './data/workspace',
};

export function loadConfig(): JarvisConfig {
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const userConfig = JSON.parse(raw);
    return {
      model: { ...DEFAULT_CONFIG.model, ...userConfig.model },
      server: { ...DEFAULT_CONFIG.server, ...userConfig.server },
      workspace: userConfig.workspace || DEFAULT_CONFIG.workspace,
      search: userConfig.search,
    };
  }
  // 如果配置文件不存在，创建默认配置
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: JarvisConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
