using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json;

namespace LandsurvConnector
{
    /// <summary>
    /// ConfigurationManager - Handles loading and saving plugin configuration
    /// </summary>
    public class ConfigurationManager
    {
        private static ConfigurationManager _instance;
        private Configuration _config;
        private readonly string _configPath;

        public static ConfigurationManager Instance
        {
            get
            {
                if (_instance == null)
                {
                    _instance = new ConfigurationManager();
                }
                return _instance;
            }
        }

        private ConfigurationManager()
        {
            // Config file in AppData
            string appDataPath = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string landsurvPath = Path.Combine(appDataPath, "LandsurvConnector");
            
            if (!Directory.Exists(landsurvPath))
            {
                Directory.CreateDirectory(landsurvPath);
            }

            _configPath = Path.Combine(landsurvPath, "config.json");
            LoadConfiguration();
        }

        /// <summary>
        /// Load configuration from file or create default
        /// </summary>
        private void LoadConfiguration()
        {
            try
            {
                if (File.Exists(_configPath))
                {
                    string json = File.ReadAllText(_configPath);
                    _config = JsonConvert.DeserializeObject<Configuration>(json);
                    System.Diagnostics.Debug.WriteLine("[Config] Configuration loaded from file");
                    
                    // Migrate old server URLs to new Cloud Run URL
                    bool needsSave = false;
                    if (_config.ServerUrl.Contains("c3dmcp.landsurv.ai") || 
                        _config.ServerUrl.Contains("landsurv-backend") ||
                        _config.ServerUrl.EndsWith("/ws"))
                    {
                        System.Diagnostics.Debug.WriteLine($"[Config] Migrating old server URL: {_config.ServerUrl}");
                        _config.ServerUrl = "wss://beta-landsurv-ai-y55gmt77ga-uw.a.run.app/c3d";
                        needsSave = true;
                    }
                    
                    if (needsSave)
                    {
                        SaveConfiguration();
                        System.Diagnostics.Debug.WriteLine("[Config] Configuration migrated and saved");
                    }
                }
                else
                {
                    _config = new Configuration();
                    SaveConfiguration();
                    System.Diagnostics.Debug.WriteLine("[Config] Default configuration created");
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[Config] Error loading configuration: {ex.Message}");
                _config = new Configuration();
            }
        }

        /// <summary>
        /// Save configuration to file
        /// </summary>
        public void SaveConfiguration()
        {
            try
            {
                string json = JsonConvert.SerializeObject(_config, Formatting.Indented);
                File.WriteAllText(_configPath, json);
                System.Diagnostics.Debug.WriteLine("[Config] Configuration saved");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[Config] Error saving configuration: {ex.Message}");
            }
        }

        /// <summary>
        /// Get configuration value
        /// </summary>
        public T Get<T>(string key, T defaultValue = default(T))
        {
            try
            {
                var property = _config.GetType().GetProperty(key);
                if (property != null)
                {
                    return (T)property.GetValue(_config);
                }
            }
            catch { }

            return defaultValue;
        }

        /// <summary>
        /// Set configuration value
        /// </summary>
        public void Set<T>(string key, T value)
        {
            try
            {
                var property = _config.GetType().GetProperty(key);
                if (property != null && property.CanWrite)
                {
                    property.SetValue(_config, value);
                    SaveConfiguration();
                }
            }
            catch { }
        }

        /// <summary>
        /// Configuration data class
        /// </summary>
        public class Configuration
        {
            [JsonProperty("serverUrl")]
            public string ServerUrl { get; set; } = "wss://beta-landsurv-ai-y55gmt77ga-uw.a.run.app/c3d";

            [JsonProperty("sessionToken")]
            public string SessionToken { get; set; } = "";

            [JsonProperty("apiKey")]
            public string ApiKey { get; set; } = ""; // Deprecated - use sessionToken instead

            [JsonProperty("licenseKey")]
            public string LicenseKey { get; set; } = "";

            [JsonProperty("autoConnect")]
            public bool AutoConnect { get; set; } = true;

            [JsonProperty("autoStartOnLoad")]
            public bool AutoStartOnLoad { get; set; } = false;

            [JsonProperty("logLevel")]
            public string LogLevel { get; set; } = "Info"; // Debug, Info, Warning, Error

            [JsonProperty("enableLocalLogging")]
            public bool EnableLocalLogging { get; set; } = true;

            [JsonProperty("connectionTimeout")]
            public int ConnectionTimeout { get; set; } = 30; // seconds

            [JsonProperty("reconnectAttempts")]
            public int ReconnectAttempts { get; set; } = 5;

            [JsonProperty("reconnectDelay")]
            public int ReconnectDelay { get; set; } = 2000; // milliseconds

            [JsonProperty("version")]
            public string Version { get; set; } = "1.0.0";

            [JsonProperty("createdDate")]
            public DateTime CreatedDate { get; set; } = DateTime.Now;

            [JsonProperty("lastModified")]
            public DateTime LastModified { get; set; } = DateTime.Now;
        }
    }
}
