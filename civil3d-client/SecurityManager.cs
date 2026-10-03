using System;
using System.Security.Cryptography;
using System.Text;

namespace LandsurvConnector
{
    /// <summary>
    /// SecurityManager - Handles API key validation, license checking, and authentication
    /// </summary>
    public static class SecurityManager
    {
        // Configuration
        private static readonly string API_KEY_ENV = "LANDSURV_API_KEY";
        private static readonly string LICENSE_KEY_ENV = "LANDSURV_LICENSE_KEY";
        private static readonly string CLIENT_ID_ENV = "LANDSURV_CLIENT_ID";

        /// <summary>
        /// Validate the current API key
        /// Returns true if valid, false otherwise
        /// </summary>
        public static bool ValidateApiKey(string apiKey = null)
        {
            try
            {
                // Get API key from parameter or environment variable
                apiKey = apiKey ?? Environment.GetEnvironmentVariable(API_KEY_ENV);

                if (string.IsNullOrWhiteSpace(apiKey))
                {
                    System.Diagnostics.Debug.WriteLine("[Security] No API key provided");
                    return false;
                }

                // Check format (should be at least 32 characters)
                if (apiKey.Length < 32)
                {
                    System.Diagnostics.Debug.WriteLine("[Security] API key format invalid");
                    return false;
                }

                // In production, validate against a license server
                // For now, just check format and length
                System.Diagnostics.Debug.WriteLine("[Security] API key validated");
                return true;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[Security] API key validation error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Validate license key
        /// Returns true if valid and not expired
        /// </summary>
        public static bool ValidateLicenseKey(string licenseKey = null)
        {
            try
            {
                // Get license key from parameter or environment variable
                licenseKey = licenseKey ?? Environment.GetEnvironmentVariable(LICENSE_KEY_ENV);

                if (string.IsNullOrWhiteSpace(licenseKey))
                {
                    System.Diagnostics.Debug.WriteLine("[Security] No license key provided");
                    return false;
                }

                // Parse license key format: "LANDSURV-YYYY-MM-DD-HASH"
                string[] parts = licenseKey.Split('-');
                if (parts.Length != 5 || parts[0] != "LANDSURV")
                {
                    System.Diagnostics.Debug.WriteLine("[Security] License key format invalid");
                    return false;
                }

                // Check expiration date
                if (DateTime.TryParse($"{parts[1]}-{parts[2]}-{parts[3]}", out DateTime expirationDate))
                {
                    if (DateTime.Now > expirationDate)
                    {
                        System.Diagnostics.Debug.WriteLine("[Security] License key expired");
                        return false;
                    }
                }

                System.Diagnostics.Debug.WriteLine("[Security] License key validated");
                return true;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[Security] License validation error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Generate a unique client ID for this installation
        /// </summary>
        public static string GenerateClientId()
        {
            try
            {
                // Get MAC address as basis for client ID
                string machineId = GetMachineId();
                string clientId = GenerateHash(machineId);
                
                System.Diagnostics.Debug.WriteLine($"[Security] Generated Client ID: {clientId}");
                return clientId;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[Security] Client ID generation error: {ex.Message}");
                return Guid.NewGuid().ToString();
            }
        }

        /// <summary>
        /// Get or create the client ID
        /// </summary>
        public static string GetClientId()
        {
            string clientId = Environment.GetEnvironmentVariable(CLIENT_ID_ENV);
            
            if (string.IsNullOrWhiteSpace(clientId))
            {
                clientId = GenerateClientId();
                Environment.SetEnvironmentVariable(CLIENT_ID_ENV, clientId, EnvironmentVariableTarget.User);
            }

            return clientId;
        }

        /// <summary>
        /// Create authentication token for WebSocket connection
        /// </summary>
        public static string CreateAuthToken(string apiKey, string clientId)
        {
            try
            {
                string timestamp = DateTime.UtcNow.ToString("O");
                string payload = $"{apiKey}:{clientId}:{timestamp}";
                string token = GenerateHash(payload);

                return token;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[Security] Auth token creation error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Generate SHA256 hash
        /// </summary>
        private static string GenerateHash(string input)
        {
            using (var sha256 = SHA256.Create())
            {
                var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
                return Convert.ToBase64String(hashedBytes);
            }
        }

        /// <summary>
        /// Get machine ID based on network adapter MAC address
        /// </summary>
        private static string GetMachineId()
        {
            try
            {
                // Use computer name + processor ID as fallback
                string computerName = Environment.MachineName;
                string processorId = GetProcessorId();
                return $"{computerName}-{processorId}";
            }
            catch
            {
                return Guid.NewGuid().ToString();
            }
        }

        /// <summary>
        /// Get processor ID from WMI
        /// </summary>
        private static string GetProcessorId()
        {
            try
            {
                var searcher = new System.Management.ManagementObjectSearcher("SELECT ProcessorId FROM Win32_Processor");
                foreach (var item in searcher.Get())
                {
                    return item["ProcessorId"].ToString();
                }
            }
            catch { }

            return "UNKNOWN";
        }

        /// <summary>
        /// Create a licensing JSON object for server transmission
        /// </summary>
        public static string CreateLicensePayload(string apiKey, string clientId)
        {
            try
            {
                string authToken = CreateAuthToken(apiKey, clientId);
                
                return $@"{{
                    ""apiKey"": ""{apiKey}"",
                    ""clientId"": ""{clientId}"",
                    ""authToken"": ""{authToken}"",
                    ""timestamp"": ""{DateTime.UtcNow:O}"",
                    ""version"": ""1.0.0""
                }}";
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[Security] License payload error: {ex.Message}");
                return null;
            }
        }
    }
}
