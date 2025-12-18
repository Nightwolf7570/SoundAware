// Configuration Manager - persists user settings
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigurationManager as IConfigurationManager, Configuration } from '../interfaces';
import { ConfigurationModel } from '../models';

export class ConfigurationManagerImpl extends EventEmitter implements IConfigurationManager {
  private config: ConfigurationModel;
  private configFilePath: string;
  private isLoaded: boolean = false;

  constructor(configDir?: string) {
    super();
    this.config = new ConfigurationModel();
    this.configFilePath = path.join(configDir || process.cwd(), 'config.json');
  }

  public setConfigFilePath(filePath: string): void {
    this.configFilePath = filePath;
  }

  public async loadConfiguration(): Promise<Configuration> {
    try {
      const data = await fs.readFile(this.configFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Validate required fields exist
      this.validateConfigData(parsed);
      
      this.config = ConfigurationModel.fromJSON(parsed);
      this.isLoaded = true;
      
      // Override with env vars if present
      this.applyEnvOverrides();
      
      this.emit('config_loaded', this.config.toJSON());
      return this.config.toJSON();
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, use defaults
        console.log('Config file not found, using defaults');
        this.applyEnvOverrides();
        this.isLoaded = true;
        this.emit('config_defaults_applied', this.config.toJSON());
        return this.config.toJSON();
      }
      
      // Parse error or other issue - use defaults but log warning
      console.warn('Error loading config, using defaults:', error.message);
      this.applyEnvOverrides();
      this.isLoaded = true;
      this.emit('config_load_error', { error: error.message });
      return this.config.toJSON();
    }
  }

  private applyEnvOverrides(): void {
    // Deepgram API key from env takes precedence
    if (process.env.DEEPGRAM_API_KEY) {
      this.config.deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    }
    
    // LLM enabled
    if (process.env.LLM_ENABLED !== undefined) {
      this.config.llmEnabled = process.env.LLM_ENABLED === 'true';
    }
    
    // Sensitivity level
    if (process.env.SENSITIVITY_LEVEL) {
      const level = process.env.SENSITIVITY_LEVEL.toLowerCase();
      if (level === 'low') this.config.sensitivityLevel = 0.3;
      else if (level === 'medium') this.config.sensitivityLevel = 0.5;
      else if (level === 'high') this.config.sensitivityLevel = 0.8;
    }
    
    // Silence timeout
    if (process.env.SILENCE_TIMEOUT_MS) {
      const timeout = parseInt(process.env.SILENCE_TIMEOUT_MS, 10);
      if (!isNaN(timeout) && timeout >= 1000) {
        this.config.silenceTimeoutMs = timeout;
      }
    }
  }

  private validateConfigData(data: any): void {
    const requiredFields = ['sensitivityLevel', 'attentionKeywords', 'silenceTimeoutMs'];
    const missingFields: string[] = [];
    
    for (const field of requiredFields) {
      if (data[field] === undefined) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      console.warn(`Config missing fields: ${missingFields.join(', ')}. Using defaults for missing fields.`);
    }
  }

  public async saveConfiguration(config: Configuration): Promise<void> {
    // Update internal config
    this.config = ConfigurationModel.fromJSON(config);
    
    // Validate before saving
    const errors = this.config.validate();
    if (errors.length > 0) {
      // Log warnings but still save (allow partial config)
      console.warn('Configuration validation warnings:', errors);
    }
    
    // Ensure directory exists
    const dir = path.dirname(this.configFilePath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write to file
    const json = JSON.stringify(this.config.toJSON(), null, 2);
    await fs.writeFile(this.configFilePath, json, 'utf-8');
    
    this.emit('config_saved', this.config.toJSON());
  }

  public async updateSensitivity(level: number): Promise<void> {
    if (level < 0 || level > 1) {
      throw new Error('Sensitivity level must be between 0 and 1');
    }
    
    this.config.sensitivityLevel = level;
    await this.saveConfiguration(this.config.toJSON());
    
    this.emit('sensitivity_updated', { level });
  }

  public async addKeyword(keyword: string): Promise<void> {
    if (!keyword || keyword.trim() === '') {
      throw new Error('Keyword cannot be empty');
    }
    
    const normalizedKeyword = keyword.toLowerCase().trim();
    
    if (!this.config.attentionKeywords.includes(normalizedKeyword)) {
      this.config.attentionKeywords.push(normalizedKeyword);
      await this.saveConfiguration(this.config.toJSON());
      
      this.emit('keyword_added', { keyword: normalizedKeyword });
    }
  }

  public async removeKeyword(keyword: string): Promise<boolean> {
    const normalizedKeyword = keyword.toLowerCase().trim();
    const index = this.config.attentionKeywords.indexOf(normalizedKeyword);
    
    if (index !== -1) {
      this.config.attentionKeywords.splice(index, 1);
      await this.saveConfiguration(this.config.toJSON());
      
      this.emit('keyword_removed', { keyword: normalizedKeyword });
      return true;
    }
    
    return false;
  }

  public async setTimeout(timeoutMs: number): Promise<void> {
    if (timeoutMs < 1000) {
      throw new Error('Timeout must be at least 1000ms');
    }
    
    this.config.silenceTimeoutMs = timeoutMs;
    await this.saveConfiguration(this.config.toJSON());
    
    this.emit('timeout_updated', { timeoutMs });
  }

  public async setUserName(name: string): Promise<void> {
    this.config.userName = name.trim();
    await this.saveConfiguration(this.config.toJSON());
    
    this.emit('username_updated', { name: this.config.userName });
  }

  public async setDeepgramApiKey(apiKey: string): Promise<void> {
    this.config.deepgramApiKey = apiKey;
    await this.saveConfiguration(this.config.toJSON());
    
    this.emit('api_key_updated');
  }

  public async setLLMEnabled(enabled: boolean): Promise<void> {
    this.config.llmEnabled = enabled;
    await this.saveConfiguration(this.config.toJSON());
    
    this.emit('llm_enabled_updated', { enabled });
  }

  // Getters for current configuration
  public getConfiguration(): Configuration {
    return this.config.toJSON();
  }

  public getSensitivityLevel(): number {
    return this.config.sensitivityLevel;
  }

  public getKeywords(): string[] {
    return [...this.config.attentionKeywords];
  }

  public getSilenceTimeout(): number {
    return this.config.silenceTimeoutMs;
  }

  public getUserName(): string {
    return this.config.userName;
  }

  public getDeepgramApiKey(): string {
    return this.config.deepgramApiKey;
  }

  public isLLMEnabled(): boolean {
    return this.config.llmEnabled;
  }

  public isConfigLoaded(): boolean {
    return this.isLoaded;
  }

  // Validation
  public validateConfiguration(): string[] {
    return this.config.validate();
  }

  // Static serialization helpers
  public static serializeConfiguration(config: Configuration): string {
    return JSON.stringify(config, null, 2);
  }

  public static deserializeConfiguration(json: string): Configuration {
    const data = JSON.parse(json);
    const model = ConfigurationModel.fromJSON(data);
    return model.toJSON();
  }
}