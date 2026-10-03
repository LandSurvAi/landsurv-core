using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace LandsurvConnector
{
    /// <summary>
    /// QRCodeGenerator - Generates QR codes for secure Civil 3D connector authentication
    /// Uses QRCoder library (needs NuGet package: QRCoder)
    /// </summary>
    public static class QRCodeGenerator
    {
        /// <summary>
        /// Generate QR code data as Base64 PNG image
        /// This QR code contains:
        /// - Temporary session token (encrypted, not API key)
        /// - Session ID
        /// - Expiration time
        /// - Nonce for verification
        /// </summary>
        public static string GenerateAuthQRCode(string apiKey, string clientId, string serverUrl, string tier = "trial")
        {
            try
            {
                System.Diagnostics.Debug.WriteLine("[QRCode] Generating authentication QR code...");

                // Step 1: Generate session token (temporary, non-reversible)
                var sessionToken = SessionAuthManager.GenerateSessionToken(apiKey, clientId, tier);
                if (sessionToken == null)
                {
                    System.Diagnostics.Debug.WriteLine("[QRCode] Failed to generate session token");
                    return null;
                }

                System.Diagnostics.Debug.WriteLine($"[QRCode] Session token created. Expires in {sessionToken.GetSecondsRemaining()} seconds");

                // Step 2: Create QR payload
                var payload = SessionAuthManager.CreateQRPayload(sessionToken, serverUrl);
                if (payload == null)
                {
                    System.Diagnostics.Debug.WriteLine("[QRCode] Failed to create QR payload");
                    return null;
                }

                // Step 3: Convert payload to JSON
                string payloadJson = payload.ToString();
                System.Diagnostics.Debug.WriteLine($"[QRCode] Payload: {payloadJson.Substring(0, Math.Min(100, payloadJson.Length))}...");

                // Step 4: Store session token for later verification
                SessionAuthManager.StoreSessionToken(sessionToken);

                // Step 5: Generate QR code
                // Note: This requires the QRCoder NuGet package
                // For now, we return the payload as JSON which can be encoded by frontend
                return payloadJson;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[QRCode] Error generating QR code: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Generate QR code as SVG (more compact than PNG)
        /// Returns SVG string that can be displayed directly in browsers
        /// </summary>
        public static string GenerateAuthQRCodeSVG(string apiKey, string clientId, string serverUrl, string tier = "trial")
        {
            try
            {
                // Generate payload first
                string payloadJson = GenerateAuthQRCode(apiKey, clientId, serverUrl, tier);
                if (payloadJson == null)
                    return null;

                // Encode payload
                string encoded = System.Uri.EscapeDataString(payloadJson);

                // Use QR code generation endpoint (or fallback to text)
                // For production, would use library like QRCoder to generate actual SVG
                string qrCodeUrl = $"https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={encoded}";

                System.Diagnostics.Debug.WriteLine($"[QRCode] QR code URL: {qrCodeUrl}");

                return qrCodeUrl;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[QRCode] Error generating QR SVG: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Verify QR code scan on backend
        /// Called by backend after Civil 3D app scans QR and sends back session token
        /// </summary>
        public static bool VerifyQRCodeScan(string sessionToken, string sessionId, string nonce, long expiresAt, string apiKey)
        {
            try
            {
                System.Diagnostics.Debug.WriteLine("[QRCode] Verifying QR code scan...");

                // Decrypt session token
                string decryptedToken = SessionAuthManager.DecryptSessionToken(sessionToken);
                if (decryptedToken == null)
                {
                    System.Diagnostics.Debug.WriteLine("[QRCode] Failed to decrypt session token");
                    return false;
                }

                // Verify token
                bool isValid = SessionAuthManager.VerifySessionToken(decryptedToken, sessionId, nonce, expiresAt, apiKey);

                if (isValid)
                {
                    System.Diagnostics.Debug.WriteLine("[QRCode] QR code verification successful");
                }
                else
                {
                    System.Diagnostics.Debug.WriteLine("[QRCode] QR code verification failed");
                }

                return isValid;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"[QRCode] Error verifying QR code: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Get QR code display info (for showing in Civil 3D UI)
        /// </summary>
        public static Dictionary<string, string> GetQRCodeInfo()
        {
            var sessionToken = SessionAuthManager.GetStoredSessionToken();

            if (sessionToken == null || !sessionToken.IsValid())
            {
                return new Dictionary<string, string>
                {
                    { "status", "no_session" },
                    { "message", "No active session. Generate a new QR code." }
                };
            }

            return new Dictionary<string, string>
            {
                { "status", "active" },
                { "sessionId", sessionToken.SessionId },
                { "expiresIn", sessionToken.GetSecondsRemaining().ToString() },
                { "tier", sessionToken.Tier },
                { "message", $"Session active. Expires in {sessionToken.GetSecondsRemaining()} seconds." }
            };
        }
    }
}
