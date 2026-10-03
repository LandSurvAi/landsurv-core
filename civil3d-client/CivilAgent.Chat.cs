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
    /// <summary>CivilAgent (partial) � Chat concerns. Split from the monolithic CivilAgent.cs; no behavior change.</summary>
    public partial class CivilAgent
    {
        /// <summary>
        /// Disconnect command: Close the connection
        /// Command: "LandsurvDisconnect"
        /// </summary>
        [CommandMethod("LandsurvDisconnect")]
        public void DisconnectLandsurv()
        {
            try
            {
                Document doc = Application.DocumentManager.MdiActiveDocument;
                if (doc != null) _editor = doc.Editor;
                DisconnectInternal();
            }
            catch (System.Exception ex)
            {
                this.PrintMessage($"Disconnect error: {ex.Message}");
            }
        }

        /// <summary>Static disconnect used by both the command and the UI button.</summary>
        /// <summary>
        /// Reflect an unexpected connection loss (socket closed/errored, not a user
        /// Disconnect) in the chat UI and stop live sync. Must run on the main thread
        /// (callers wrap in ThreadMarshaler).
        /// </summary>
        private static void NotifyConnectionLost(string reason)
        {
            _isConnected = false;
            if (_liveSyncEnabled) SetLiveSyncEnabled(false);
            if (_chatForm != null && !_chatForm.IsDisposed)
            {
                _chatForm.SetStatus(string.IsNullOrWhiteSpace(reason) ? "Disconnected" : reason, false);
            }
        }

        private static void DisconnectInternal()
        {
            // Live sync depends on the socket — turn it off cleanly first.
            if (_liveSyncEnabled) SetLiveSyncEnabled(false);
            if (_webSocket != null && _isConnected)
            {
                try
                {
                    _cancellationTokenSource?.Cancel();
                    _webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "User disconnected", CancellationToken.None).Wait(2000);
                }
                catch { /* best-effort close */ }
                finally
                {
                    _webSocket.Dispose();
                    _webSocket = null;
                    _isConnected = false;
                }
                if (_editor != null) _editor.WriteMessage("\n✓ Disconnected from LandSurv.ai\n");
            }
            else
            {
                if (_editor != null) _editor.WriteMessage("\nNot currently connected.\n");
            }
        }

        /// <summary>
        /// Show the chat form as a floating window in Civil 3D
        /// </summary>
        private static void ShowChatWindow()
        {
            try
            {
                if (_chatForm == null || _chatForm.IsDisposed)
                {
                    _chatForm = new ChatForm();
                    
                    // Wire up message sent event to send over WebSocket
                    _chatForm.SendMessageToServer += (sender, message) =>
                    {
                        SendChatMessage(message);
                    };
                    
                    // Wire up refresh drawings button
                    _chatForm.RefreshDrawingsRequested += (sender, e) =>
                    {
                        RefreshDrawingsList();
                    };
                    
                    // Wire up drawing selection change
                    _chatForm.DrawingSelected += (sender, drawingPath) =>
                    {
                        SetActiveDrawingByPath(drawingPath);
                    };

                    // Sync is the single live-sync workflow. The first press runs the
                    // normal guarded wizard so it can establish a trustworthy baseline;
                    // live reconciliation starts after that apply completes.
                    _chatForm.SyncRequested += (sender, e) =>
                    {
                        StartSyncWizardFlow(enableLiveAfterApply: true);
                    };

                    // Disconnect button — close the WebSocket + reflect status.
                    _chatForm.DisconnectRequested += (sender, e) =>
                    {
                        DisconnectInternal();
                        if (_chatForm != null && !_chatForm.IsDisposed)
                        {
                            _chatForm.SetStatus("Disconnected", false);
                            _chatForm.AddMessage("System", "Disconnected from LandSurv.ai. Run LANDSURVAI to reconnect.");
                        }
                    };
                }

                // Update status and refresh drawings list
                _chatForm.SetStatus(_isConnected ? "Connected" : "Disconnected", _isConnected);
                _chatForm.AddMessage("System", "Connected to LandSurv.ai AI Agent");
                
                // Auto-populate drawings list on show
                RefreshDrawingsList();

                // Show the form as modeless dialog, kept above Civil 3D
                // (MainWindow is an Autodesk.AutoCAD.Windows.Window, not a WinForms
                // IWin32Window, so TopMost is the portable way to keep it in front).
                if (!_chatForm.Visible)
                {
                    _chatForm.TopMost = true;
                    _chatForm.Show();
                }

                if (_editor != null)
                {
                    _editor.WriteMessage("\n✓ Chat window opened. Type your commands in the chat box.\n");
                }
            }
            catch (System.Exception ex)
            {
                if (_editor != null)
                {
                    _editor.WriteMessage($"\n⚠ Error showing chat window: {ex.Message}\n");
                }
            }
        }

        /// <summary>
        /// Send a chat message to the server
        /// </summary>
        private static void SendChatMessage(string message)
        {
            try
            {
                if (_webSocket == null || _webSocket.State != WebSocketState.Open)
                {
                    if (_chatForm != null && !_chatForm.IsDisposed)
                    {
                        _chatForm.AddMessage("System", "Error: Not connected to server");
                    }
                    return;
                }

                // Create message envelope
                var msgJson = new JObject
                {
                    { "type", "chat" },
                    { "message", message },
                    { "sessionId", _sessionId ?? "" },
                    { "timestamp", DateTime.Now.ToString("O") }
                };

                SendWebSocketMessage(msgJson.ToString());
                
                // Show in chat form and mark the agent as busy until a response arrives
                if (_chatForm != null && !_chatForm.IsDisposed)
                {
                    _chatForm.AddMessage("You", message);
                    _chatForm.SetBusy(true);
                }
            }
            catch (System.Exception ex)
            {
                if (_chatForm != null && !_chatForm.IsDisposed)
                {
                    _chatForm.AddMessage("System", $"Error: {ex.Message}");
                }
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // SYNC ENGINE INTEGRATION (connector overhaul Phase 2)
        //
        // Two entry points share one engine:
        //   1. DLL sync wizard — user clicks "⇄ Sync" in the chat header:
        //      request_state → webapp answers → diff both snapshots → wizard →
        //      apply (CAD-side here, LSAI-side via sync_lsai_apply round-trip).
        //   2. Webapp Sync Center — sends get_sync_snapshot / sync_apply tools
        //      through the relay; the same SyncEngine/SyncApplier runs them.
        //
        // Safeguards: baseline-aware conflicts, backups before mutation, explicit
        // deletes only, relay-side sync mutex, progress + audit messages.
        // ══════════════════════════════════════════════════════════════════════

        private static UI.SyncWizardForm _syncWizard;
        private static string _pendingWizardRequestId;
        private static CancellationTokenSource _syncApplyCts;
        private static string _pendingLsaiApplyId;
        private static Sync.SyncSnapshot _wizardLsaiSnapshot;

        // Apply-run bookkeeping for the final report
        private static int _wizardApplySucceeded;
        private static int _wizardApplyFailed;
        private static int _wizardApplySkipped;
        private static string _wizardApplyBackupPath;

    }
}