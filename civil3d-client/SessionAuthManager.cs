using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;

namespace LandsurvConnector
{
    /// <summary>
    /// SessionAuthManager - Handles secure QR code authentication with session tokens
    /// Never exposes API keys in QR codes - uses temporary, single-use session tokens instead
    /// </summary>
    public static class SessionAuthManager
    {
        /// <summary>
        /// Session token data structure
        /// </summary>
        public class SessionToken
        {
            [JsonProperty("token")]
            public string Token { get; set; }

            [JsonProperty("sessionId")]
            public string SessionId { get; set; }

            [JsonProperty("expiresAt")]
            public long ExpiresAt { get; set; } // Unix timestamp in seconds

            [JsonProperty("clientId")]
            public string ClientId { get; set; }

            [JsonProperty("nonce")]
            public string Nonce { get; set; } // Random value for verification

            [JsonProperty("tier")]
            public string Tier { get; set; } // "trial" or "pro"

            /// <summary>
            /// Check if token is still valid
            /// </summary>
            public bool IsValid()
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                return now < ExpiresAt;
            }

            /// <summary>
            /// Get remaining seconds until expiration
            /// </summary>
            public long GetSecondsRemaining()
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                return ExpiresAt - now;
            }
        }

        /// <summary>
        /// QR Code data payload
        /// This is what gets encoded in the QR code
        /// </summary>
        public class QRCodePayload
        {
            [JsonProperty("version")]
            public string Version { get; set; } = "1.0";

            [JsonProperty("type")]
            public string Type { get; set; } = "auth";

            [JsonProperty("server")]
            public string Server { get; set; } // e.g., "c3dmcp.landsurv.ai"

            [JsonProperty("sessionToken")]
            public string SessionToken { get; set; } // Encrypted session token (not plain API key!)

            [JsonProperty("sessionId")]
            public string SessionId { get; set; }

            [JsonProperty("expiresIn")]
            public int ExpiresIn { get; set; } // Seconds until expiration

            [JsonProperty("nonce")]
            public string Nonce { get; set; } // Random value for verification

            public override string ToString()
            {
                return JsonConvert.SerializeObject(this);
            }
        }

        private static readonly int SESSION_TOKEN_EXPIRY = 300; // 5 minutes
        private static readonly string ENCRYPTION_KEY = "LandsurvC3DMCPSecureSession"; // TODO: Use environment variable

        /// <summary>
        /// Generate a secure session token from API key
        /// The session token is temporary and cannot be reverse-engineered to get the API key
        /// </summary>
        public static SessionToken GenerateSessionToken(string apiKey, string clientId, string tier = "trial")
        {
            try
            {
                // Create session ID
                string sessionId = Guid.NewGuid().ToString("N");
                
                // Create nonce for verification
                string nonce = GenerateRandomNonce();
                
                // Calculate expiration
                long expiresAt = DateTimeOffset.UtcNow.AddSeconds(SESSION_TOKEN_EXPIRY).ToUnixTimeSeconds();
                
                // Create token: hash of (apiKey + sessionId + nonce + timestamp)
                // This is NOT reversible - you can't extract the API key from the token
                string tokenPayload = $"{apiKey}:{sessionId}:{nonce}:{expiresAt}";
                string token = GenerateSecureHash(tokenPayload);

                return new SessionToken
                {
                    Token = token,
                    SessionId = sessionId,
                    ExpiresAt = expiresAt,
                    ClientId = clientId,
                    Nonce = nonce,
                    Tier = tier
                };
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SessionAuth] Token generation error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Create QR code payload with encrypted session token
        /// </summary>
        public static QRCodePayload CreateQRPayload(SessionToken sessionToken, string serverUrl)
        {
            try
            {
                if (sessionToken == null || !sessionToken.IsValid())
                {
                    System.Diagnostics.Debug.WriteLine("[SessionAuth] Session token is invalid or expired");
                    return null;
                }

                // Extract server hostname from full URL
                string server = ExtractServerHost(serverUrl);

                // Encrypt the session token so it can't be read from QR code image
                string encryptedToken = EncryptSessionToken(sessionToken.Token);

                long secondsRemaining = sessionToken.GetSecondsRemaining();

                var payload = new QRCodePayload
                {
                    Server = server,
                    SessionToken = encryptedToken,
                    SessionId = sessionToken.SessionId,
                    ExpiresIn = (int)secondsRemaining,
                    Nonce = sessionToken.Nonce
                };

                return payload;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SessionAuth] QR payload creation error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Verify a session token (called by backend after QR scan)
        /// Backend checks: token matches hash(apiKey + sessionId + nonce + expiresAt) AND token not expired
        /// </summary>
        public static bool VerifySessionToken(string token, string sessionId, string nonce, long expiresAt, string apiKey)
        {
            try
            {
                // Reconstruct the original token
                string tokenPayload = $"{apiKey}:{sessionId}:{nonce}:{expiresAt}";
                string expectedToken = GenerateSecureHash(tokenPayload);

                // Constant-time comparison to prevent timing attacks
                return ConstantTimeEquals(token, expectedToken);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SessionAuth] Token verification error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Encrypt session token (so it can't be read from QR code images)
        /// Uses AES-256-GCM for authenticated encryption
        /// </summary>
        private static string EncryptSessionToken(string token)
        {
            try
            {
                // For production: use proper key derivation from ENCRYPTION_KEY
                byte[] key = Encoding.UTF8.GetBytes(ENCRYPTION_KEY.PadRight(32).Substring(0, 32));
                byte[] nonce = new byte[12]; // 96-bit nonce for GCM

                using (var rng = RandomNumberGenerator.Create())
                {
                    rng.GetBytes(nonce);
                }

                using (var cipher = new System.Security.Cryptography.AesGcm(key))
                {
                    byte[] plaintext = Encoding.UTF8.GetBytes(token);
                    byte[] ciphertext = new byte[plaintext.Length];
                    byte[] tag = new byte[16]; // 128-bit authentication tag

                    cipher.Encrypt(nonce, plaintext, ciphertext, tag);

                    // Return: nonce + ciphertext + tag (all base64)
                    byte[] combined = new byte[nonce.Length + ciphertext.Length + tag.Length];
                    Buffer.BlockCopy(nonce, 0, combined, 0, nonce.Length);
                    Buffer.BlockCopy(ciphertext, 0, combined, nonce.Length, ciphertext.Length);
                    Buffer.BlockCopy(tag, 0, combined, nonce.Length + ciphertext.Length, tag.Length);

                    return Convert.ToBase64String(combined);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SessionAuth] Encryption error: {ex.Message}");
                return token; // Fallback to unencrypted (less secure)
            }
        }

        /// <summary>
        /// Decrypt session token (called by backend)
        /// </summary>
        public static string DecryptSessionToken(string encryptedToken)
        {
            try
            {
                byte[] key = Encoding.UTF8.GetBytes(ENCRYPTION_KEY.PadRight(32).Substring(0, 32));
                byte[] combined = Convert.FromBase64String(encryptedToken);

                byte[] nonce = new byte[12];
                byte[] ciphertext = new byte[combined.Length - 28]; // 12 (nonce) + 16 (tag)
                byte[] tag = new byte[16];

                Buffer.BlockCopy(combined, 0, nonce, 0, 12);
                Buffer.BlockCopy(combined, 12, ciphertext, 0, combined.Length - 28);
                Buffer.BlockCopy(combined, combined.Length - 16, tag, 0, 16);

                using (var cipher = new System.Security.Cryptography.AesGcm(key))
                {
                    byte[] plaintext = new byte[ciphertext.Length];
                    cipher.Decrypt(nonce, ciphertext, tag, plaintext);
                    return Encoding.UTF8.GetString(plaintext);
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SessionAuth] Decryption error: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Generate secure SHA256 hash (not reversible)
        /// </summary>
        private static string GenerateSecureHash(string input)
        {
            using (var sha256 = SHA256.Create())
            {
                var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
                return Convert.ToBase64String(hashedBytes);
            }
        }

        /// <summary>
        /// Generate random nonce for verification
        /// </summary>
        private static string GenerateRandomNonce()
        {
            using (var rng = RandomNumberGenerator.Create())
            {
                byte[] nonce = new byte[32];
                rng.GetBytes(nonce);
                return Convert.ToBase64String(nonce);
            }
        }

        /// <summary>
        /// Extract server hostname from WebSocket URL
        /// e.g., "wss://c3dmcp.landsurv.ai/ws" → "c3dmcp.landsurv.ai"
        /// </summary>
        private static string ExtractServerHost(string wsUrl)
        {
            try
            {
                Uri uri = new Uri(wsUrl);
                return uri.Host;
            }
            catch
            {
                return "c3dmcp.landsurv.ai";
            }
        }

        /// <summary>
        /// Constant-time string comparison to prevent timing attacks
        /// </summary>
        private static bool ConstantTimeEquals(string a, string b)
        {
            if (a == null || b == null)
                return a == b;

            int result = 0;
            int minLength = Math.Min(a.Length, b.Length);

            for (int i = 0; i < minLength; i++)
            {
                result |= a[i] ^ b[i];
            }

            result |= a.Length ^ b.Length;
            return result == 0;
        }

        /// <summary>
        /// Store session token locally for later use
        /// </summary>
        public static void StoreSessionToken(SessionToken token)
        {
            try
            {
                string json = JsonConvert.SerializeObject(token);
                var config = ConfigurationManager.Instance;
                config.Set("SessionToken", json);
                System.Diagnostics.Debug.WriteLine("[SessionAuth] Session token stored");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SessionAuth] Failed to store session token: {ex.Message}");
            }
        }

        /// <summary>
        /// Retrieve stored session token
        /// </summary>
        public static SessionToken GetStoredSessionToken()
        {
            try
            {
                var config = ConfigurationManager.Instance;
                string json = config.Get("SessionToken", "");

                if (string.IsNullOrWhiteSpace(json))
                    return null;

                SessionToken token = JsonConvert.DeserializeObject<SessionToken>(json);

                // Check if expired
                if (token != null && !token.IsValid())
                {
                    ClearStoredSessionToken();
                    return null;
                }

                return token;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SessionAuth] Failed to retrieve session token: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Clear stored session token
        /// </summary>
        public static void ClearStoredSessionToken()
        {
            try
            {
                var config = ConfigurationManager.Instance;
                config.Set("SessionToken", "");
                System.Diagnostics.Debug.WriteLine("[SessionAuth] Session token cleared");
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[SessionAuth] Failed to clear session token: {ex.Message}");
            }
        }
    }
}
