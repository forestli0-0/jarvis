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

function validateConfig(config: JarvisConfig): void {
  if (!config.model.api_key) {
    throw new Error('配置错误: model.api_key 未设置，请在 jarvis.config.json 中配置 API 密钥');
  }
  if (!config.model.base_url) {
    throw new Error('配置错误: model.base_url 未设置');
  }
  if (!config.model.model_name) {
    throw new Error('配置错误: model.model_name 未设置');
  }
  if (typeof config.server.port !== 'number' || config.server.port < 1 || config.server.port > 65535) {
    throw new Error(`配置错误: server.port 无效 (${config.server.port})，应为 1-65535 的数字`);
  }
}

export function loadConfig(): JarvisConfig {
  if (fs.existsSync(CONFIG_PATH)) {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    const userConfig = JSON.parse(raw);
    const config: JarvisConfig = {
      model: { ...DEFAULT_CONFIG.model, ...userConfig.model },
      server: { ...DEFAULT_CONFIG.server, ...userConfig.server },
      workspace: userConfig.workspace || DEFAULT_CONFIG.workspace,
      search: userConfig.search,
    };
    validateConfig(config);
    return config;
  }
  // 如果配置文件不存在，创建默认配置
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: JarvisConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
