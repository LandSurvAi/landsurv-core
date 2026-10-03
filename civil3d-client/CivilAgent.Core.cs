using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.AutoCAD.ApplicationServices;
using Autodesk.AutoCAD.DatabaseServices;
using Autodesk.AutoCAD.EditorInput;
using Autodesk.AutoCAD.Geometry;
using Autodesk.AutoCAD.Runtime;
// Civil 3D references disabled - not available in base AutoCAD
// using Autodesk.Civil.ApplicationServices;
// using Autodesk.Civil.DatabaseServices;
using Newtonsoft.Json.Linq;
using LandsurvConnector.UI;

namespace LandsurvConnector
{
    /// <summary>CivilAgent (partial) � Core concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        private static ClientWebSocket _webSocket;
        private static string _sessionId;
        private static string _sessionToken;
        private static string _serverUrl;
        private static Editor _editor;
        private static bool _isConnected = false;
        private static Task _messageListenerTask;
        private static CancellationTokenSource _cancellationTokenSource;
        private static ChatForm _chatForm;
        private static string _clientId;

        // Get server URL from configuration
        private static string SERVER_URL => ConfigurationManager.Instance.Get("ServerUrl", "wss://beta-landsurv-ai-y55gmt77ga-uw.a.run.app/c3d");

        // For local testing:
        // private const string SERVER_URL = "ws://localhost:8080/c3d";

        /// <summary>
        /// Main command: Activate the Landsurv AI Agent
        /// Command: "LandsurvAI"
        /// </summary>
        [CommandMethod("LandsurvAI")]
        public void ActivateLandsurvAI()
        {
            try
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc == null)
                {
                    this.PrintMessage("Error: No active document");
                    return;
                }

                _editor = doc.Editor;

                // Get configuration
                var config = ConfigurationManager.Instance;
                string sessionToken = config.Get("SessionToken", "");
                string licenseKey = config.Get("LicenseKey", "");

                // Check for session token
                if (string.IsNullOrWhiteSpace(sessionToken))
                {
                    this.PrintMessage("╔════════════════════════════════════════════════════════════╗");
                    this.PrintMessage("║  SESSION TOKEN REQUIRED                                    ║");
                    this.PrintMessage("╠════════════════════════════════════════════════════════════╣");
                    this.PrintMessage("║  1. Go to landsurv.ai                                      ║");
                    this.PrintMessage("║  2. Click 'Connect Civil 3D' button                        ║");
                    this.PrintMessage("║  3. Copy the session token (LSC-XXXXX-XXXXX)               ║");
                    this.PrintMessage("║  4. Run LANDSURVCONFIG to enter the token                  ║");
                    this.PrintMessage("╚════════════════════════════════════════════════════════════╝");
                    return;
                }

                // Validate session token format (LSC-XXXXX-XXXXX)
                if (!sessionToken.StartsWith("LSC-") || sessionToken.Length != 15)
                {
                    this.PrintMessage("⚠ Invalid session token format. Expected: LSC-XXXXX-XXXXX");
                    this.PrintMessage("  Get a new token from landsurv.ai → Connect Civil 3D");
                    return;
                }

                this.PrintMessage("ℹ Connecting to LandSurv.ai...");
                this.PrintMessage($"  Session Token: {sessionToken.Substring(0, 9)}...{sessionToken.Substring(sessionToken.Length - 5)}");
                
                // License key is optional
                if (string.IsNullOrWhiteSpace(licenseKey))
                {
                    licenseKey = "trial_license";
                }

                // Validate license key (optional)
                if (!string.IsNullOrWhiteSpace(licenseKey) && !SecurityManager.ValidateLicenseKey(licenseKey))
                {
                    this.PrintMessage("  Mode: Trial");
                    licenseKey = "trial_license";
                }

                // Generate or get client ID
                _clientId = SecurityManager.GetClientId();

                // Connect to WebSocket server (no API key needed)
                ConnectToServer(_clientId);

                if (_isConnected)
                {
                    // Note: Full connection info will be displayed when server sends 'connected' message
                    
                    // Show chat window
                    ShowChatWindow();
                }
                else
                {
                    this.PrintMessage("✗ Failed to connect to server");
                }
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"Error: {ex.Message}");
            }
        }

        /// <summary>
        /// Connect to the WebSocket server with session token
        /// </summary>
        private void ConnectToServer(string clientId)
        {
            try
            {
                // Get session token from config
                var config = ConfigurationManager.Instance;
                string sessionToken = config.Get("SessionToken", "");
                string serverUrl = config.Get("ServerUrl", SERVER_URL);
                
                // Store for later use in connection info display
                _sessionToken = sessionToken;
                _serverUrl = serverUrl;
                
                // Build URL with session token
                string connectionUrl = $"{serverUrl}?token={sessionToken}";
                
                // Create new ClientWebSocket (built-in .NET 8 WebSocket)
                _webSocket = new ClientWebSocket();
                _webSocket.Options.SetRequestHeader("X-Client-Id", clientId);
                
                // Cancel any existing connection
                if (_cancellationTokenSource != null)
                    _cancellationTokenSource.Cancel();
                _cancellationTokenSource = new CancellationTokenSource();
                
                // Connect asynchronously
                var uri = new Uri(connectionUrl);
                
                var connectTask = _webSocket.ConnectAsync(uri, _cancellationTokenSource.Token);
                
                // Wait for connection with timeout
                if (connectTask.Wait(TimeSpan.FromSeconds(10)))
                {
                    if (_webSocket.State == WebSocketState.Open)
                    {
                        _isConnected = true;
                        this.PrintMessage("  WebSocket connected, waiting for server...");
                        
                        // Start message receiver loop
                        _messageListenerTask = Task.Run(() => ReceiveMessagesAsync(_cancellationTokenSource.Token));
                    }
                    else
                    {
                        this.PrintMessage($"✗ Connection failed - WebSocket state: {_webSocket.State}");
                        _isConnected = false;
                    }
                }
                else
                {
                    this.PrintMessage("✗ Connection timeout (10s)");
                    _isConnected = false;
                }
            }
            catch (AggregateException ae)
            {
                foreach (var ex in ae.InnerExceptions)
                {
                    this.PrintMessage($"✗ Connection error: {ex.Message}");
                }
                _isConnected = false;
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"✗ Connection error: {ex.Message}");
                _isConnected = false;
            }
        }

        /// <summary>
        /// Async loop to receive messages from the WebSocket
        /// </summary>
        private async Task ReceiveMessagesAsync(CancellationToken cancellationToken)
        {
            var buffer = new byte[8192];
            var messageBuilder = new StringBuilder();
            
            try
            {
                while (_webSocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
                {
                    var segment = new ArraySegment<byte>(buffer);
                    WebSocketReceiveResult result;
                    
                    try
                    {
                        result = await _webSocket.ReceiveAsync(segment, cancellationToken);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                    
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        _isConnected = false;
                        ThreadMarshaler.Execute(() =>
                        {
                            var closeStatus = (int)(result.CloseStatus ?? WebSocketCloseStatus.NormalClosure);
                            this.PrintMessage($"[DEBUG] Connection closed - Code: {closeStatus}, Reason: {result.CloseStatusDescription}");
                            
                            if (closeStatus == 4003)
                            {
                                this.PrintMessage("⏸ Session paused - trial period ended");
                            }
                            else if (closeStatus == 4001)
                            {
                                this.PrintMessage("✗ Invalid session token");
                            }
                            else
                            {
                                this.PrintMessage("Connection closed");
                            }
                            NotifyConnectionLost(closeStatus == 4003 ? "Session paused" : "Disconnected");
                        });
                        break;
                    }
                    
                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        messageBuilder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                        
                        if (result.EndOfMessage)
                        {
                            var message = messageBuilder.ToString();
                            messageBuilder.Clear();
                            
                            ThreadMarshaler.Execute(() =>
                            {
                                HandleServerMessage(message);
                            });
                        }
                    }
                }
            }
            catch (WebSocketException ex)
            {
                _isConnected = false;
                ThreadMarshaler.Execute(() =>
                {
                    this.PrintMessage($"⚠ WebSocket error: {ex.Message}");
                    NotifyConnectionLost("Connection lost");
                });
            }
            catch (System.Exception ex)
            {
                _isConnected = false;
                ThreadMarshaler.Execute(() =>
                {
                    this.PrintMessage($"⚠ Receive error: {ex.Message}");
                    NotifyConnectionLost("Connection lost");
                });
            }
        }

        /// <summary>
        /// Send a message over the WebSocket connection
        /// </summary>
        private static void SendWebSocketMessage(string message)
        {
            if (_webSocket == null || _webSocket.State != WebSocketState.Open)
            {
                return;
            }
            
            try
            {
                var bytes = Encoding.UTF8.GetBytes(message);
                var segment = new ArraySegment<byte>(bytes);
                _webSocket.SendAsync(segment, WebSocketMessageType.Text, true, CancellationToken.None).Wait(5000);
            }
            catch (System.Exception ex)
            {
                // Silent fail for static context
            }
        }

        public static void SendCacpAcknowledgment(string ackJson)
        {
            if (string.IsNullOrWhiteSpace(ackJson))
            {
                return;
            }

            try
            {
                SendWebSocketMessage(ackJson);
            }
            catch (System.Exception)
            {
                // Silently ignore if the socket is unavailable.
            }
        }

        /// <summary>
        /// Background task to listen for messages from the server (legacy - kept for compatibility)
        /// </summary>
        private void MessageListener(CancellationToken cancellationToken)
        {
            try
            {
                while (!cancellationToken.IsCancellationRequested && _isConnected)
                {
                    Thread.Sleep(100); // Small delay to avoid busy waiting
                }
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"Message listener error: {ex.Message}");
            }
        }

        /// <summary>
        /// Handle incoming messages from the server
        /// </summary>
        private void HandleServerMessage(string messageData)
        {
            try
            {
                JObject message = JObject.Parse(messageData);
                string type = message["type"]?.ToString();

                switch (type)
                {
                    case "session_info":
                        {
                            _sessionId = message["sessionId"]?.ToString();
                            this.PrintMessage($"Session established: {_sessionId}");
                            break;
                        }

                    case "command":
                        {
                            string tool = message["tool"]?.ToString();
                            string requestId = message["requestId"]?.ToString();
                            JObject args = (JObject)message["args"];

                            this.PrintMessage($"Received command: {tool} (Request: {requestId})");

                            // Execute command on main UI thread (required for Civil 3D database operations)
                            ThreadMarshaler.Execute(() =>
                            {
                                ExecuteCommand(tool, args, requestId);
                            });
                            break;
                        }

                    case "response":
                        {
                            string responseText = message["message"]?.ToString();
                            this.PrintMessage($"AI Response: {responseText}");
                            
                            // Show in chat form and clear busy state
                            if (_chatForm != null && !_chatForm.IsDisposed)
                            {
                                _chatForm.AddMessage("AI Agent", responseText);
                                _chatForm.SetBusy(false);
                            }
                            break;
                        }

                    case "error":
                        {
                            string errorMsg = message["message"]?.ToString();
                            this.PrintMessage($"Server Error: {errorMsg}");
                            
                            // Show in chat form and clear busy state
                            if (_chatForm != null && !_chatForm.IsDisposed)
                            {
                                _chatForm.AddMessage("System", $"Error: {errorMsg}");
                                _chatForm.SetBusy(false);
                            }
                            break;
                        }

                    case "connected":
                        {
                            // Server confirmed connection - display nice connection info
                            string serverSessionId = message["sessionId"]?.ToString() ?? "N/A";
                            string serverClientId = message["clientId"]?.ToString() ?? "N/A";
                            string tier = message["tier"]?.ToString() ?? "trial";
                            string serverMsg = message["message"]?.ToString() ?? "";
                            string timestamp = message["timestamp"]?.ToString() ?? "";
                            
                            // Get our DLL version from the assembly (single source of truth: AssemblyInfo.cs)
                            string dllVersion = typeof(CivilAgent).Assembly.GetName().Version?.ToString() ?? "unknown";
                            
                            this.PrintMessage("═══════════════════════════════════════════════════════════════");
                            this.PrintMessage("  ✓ Connected to LandSurv.ai Web App");
                            this.PrintMessage("═══════════════════════════════════════════════════════════════");
                            this.PrintMessage($"  DLL Version:   v{dllVersion}");
                            this.PrintMessage($"  Session Token: {_sessionToken}");
                            this.PrintMessage($"  Client ID:     {serverClientId.Substring(0, Math.Min(16, serverClientId.Length))}...");
                            this.PrintMessage($"  Tier:          {tier.ToUpper()}");
                            this.PrintMessage($"  Server:        {_serverUrl?.Replace("wss://", "").Replace("/c3d", "")}");
                            this.PrintMessage($"  Connected At:  {DateTime.Now:h:mm:ss tt}");
                            this.PrintMessage("───────────────────────────────────────────────────────────────");
                            this.PrintMessage("  Waiting for commands from AI...");
                            this.PrintMessage("═══════════════════════════════════════════════════════════════");
                            
                            // Send version info back to server
                            try
                            {
                                JObject versionMsg = new JObject();
                                versionMsg["type"] = "client_info";
                                versionMsg["version"] = dllVersion;
                                versionMsg["civil3dVersion"] = Autodesk.AutoCAD.ApplicationServices.Application.Version.ToString();
                                versionMsg["timestamp"] = DateTime.Now.ToString("o");
                                SendWebSocketMessage(versionMsg.ToString());
                            }
                            catch (System.Exception vex)
                            {
                                this.PrintMessage($"  Warning: Could not send version info: {vex.Message}");
                            }
                            
                            // Show in chat form if open
                            if (_chatForm != null && !_chatForm.IsDisposed)
                            {
                                _chatForm.AddMessage("System", $"Connected! Session: {_sessionToken}");
                            }
                            break;
                        }

                    case "cacp_action":
                        {
                            JObject action = (JObject)message["action"] ?? message;
                            string actionId = action["action_id"]?.ToString() ?? "unknown";
                            this.PrintMessage($"📥 Received CACP action from cloud: {actionId}");

                            try
                            {
                                Document doc = Application.DocumentManager.MdiActiveDocument;
                                if (doc == null)
                                {
                                    this.PrintMessage("✗ No active document available to process CACP action");
                                    break;
                                }

                                var listener = new CacpEventListener(doc);
                                Task.Run(async () => await listener.HandleCacpActionAsync(action.ToString()));
                            }
                            catch (System.Exception ex)
                            {
                                this.PrintMessage($"✗ Failed to process CACP action: {ex.Message}");
                            }
                            break;
                        }

                    case "state_response":
                        {
                            // Webapp answered our request_state (sync wizard OR live-sync flow)
                            string stateRequestId = message["requestId"]?.ToString() ?? "";
                            this.PrintMessage($"Received webapp state ({stateRequestId})");
                            if (stateRequestId.StartsWith("live-"))
                                OnLiveStateResponse(stateRequestId, message["data"] as JObject);
                            else
                                OnWizardStateResponse(stateRequestId, message["data"] as JObject);
                            break;
                        }

                    case "state_error":
                        {
                            string stateRequestId = message["requestId"]?.ToString() ?? "";
                            string stateError = message["error"]?.ToString() ?? "Unknown state error";
                            if (stateRequestId.StartsWith("live-"))
                            {
                                OnLiveStateError(stateRequestId, stateError);
                            }
                            else
                            {
                                this.PrintMessage($"⚠ State request failed: {stateError}");
                                OnWizardStateError(stateRequestId, stateError);
                            }
                            break;
                        }

                    case "sync_lsai_result":
                        {
                            // Webapp applied (or failed to apply) the LSAI-side sync actions
                            string applyId = message["requestId"]?.ToString() ?? "";
                            bool applyOk = message["success"]?.ToObject<bool>() ?? false;
                            string applySummary = message["summary"]?.ToString() ?? message["error"]?.ToString() ?? "";
                            if (applyId.StartsWith("live-"))
                                OnLiveLsaiApplyResult(applyId, applyOk, applySummary);
                            else
                                OnWizardLsaiApplyResult(applyId, applyOk, applySummary);
                            break;
                        }

                    case "sync_rejected":
                        {
                            string reason = message["reason"]?.ToString() ?? "A sync is already in progress.";
                            this.PrintMessage($"⚠ Sync rejected: {reason}");
                            OnWizardSyncRejected(reason);
                            break;
                        }

                    case "ack":
                        {
                            // Acknowledgment from server - silently ignore
                            break;
                        }

                    default:
                        {
                            this.PrintMessage($"Unknown message type: {type}");
                            break;
                        }
                }
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"Error handling message: {ex.Message}");
            }
        }

    }
}