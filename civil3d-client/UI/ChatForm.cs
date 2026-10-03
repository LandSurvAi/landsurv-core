using System;
using System.Collections.Generic;
using System.Drawing;
using System.Windows.Forms;

namespace LandsurvConnector.UI
{
    /// <summary>
    /// Chat interface for the Civil 3D connector.
    ///
    /// v3 redesign — readability first. The message transcript is a RichTextBox
    /// (dark theme, colored role labels, word-wrapped, auto-scroll) instead of an
    /// owner-drawn ListBox, which rendered unreadably across DPI/hosts. Layout is
    /// TableLayoutPanel-driven and DPI-aware; the LandSurv.ai logo is the shared
    /// owner-drawn BrandLogo (correct kerning, paints its own background).
    ///
    /// Integration contract consumed by CivilAgent (unchanged):
    ///   ctor(), SetStatus(string, bool), AddMessage(string, string), SetBusy(bool),
    ///   UpdateDrawingsList(List&lt;DrawingItem&gt;), GetSelectedDrawing(),
    ///   events SendMessageToServer / RefreshDrawingsRequested / DrawingSelected /
    ///   SyncRequested / DisconnectRequested.
    ///
    /// VERSION NOTE: WindowTitle / SubtitleText are referenced by the
    /// version-consistency test and DEPLOYMENT_PROCESS.md — bump together with the
    /// other version locations.
    /// </summary>
    public class ChatForm : Form
    {
        private const string WindowTitle = "LandSurv.ai Chat (v26.09.07.09)";
        private const string SubtitleText = "Agent Chat (beta) v26.09.07.09";

        private readonly RichTextBox transcript;
        private TextBox messageInput;
        private Button sendButton;
        private RoundedButton syncButton;
        private Button disconnectButton;
        private Button settingsButton;
        private readonly Label statusStripLabel;
        private StatusPill statusPill;
        private readonly Timer busyTimer;

        private bool _connected;
        private bool _busy;
        private bool _liveOn;
        private int _busyTick;
        private string _lastStatusText = "Ready";
        private bool _suppressDrawingEvents;

        // De-dupe: collapse consecutive identical system lines into "×N".
        private string _lastSystemText;
        private int _lastSystemRepeat;
        private int _lastSystemLineStart = -1;

        public event EventHandler<string> SendMessageToServer;
        public event EventHandler<string> DrawingSelected;
        public event EventHandler RefreshDrawingsRequested;
        public event EventHandler SyncRequested;
        public event EventHandler DisconnectRequested;

        public ChatForm()
        {
            this.Text = WindowTitle;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.Sizable;
            this.MaximizeBox = true;
            this.MinimizeBox = true;
            this.BackColor = BrandTheme.BgDeep;
            this.ForeColor = BrandTheme.TextPrimary;
            this.AutoScaleMode = AutoScaleMode.Dpi;
            this.AutoScaleDimensions = new SizeF(96F, 96F);
            this.ClientSize = new Size(500, 640);
            this.MinimumSize = new Size(440, 560);
            this.Font = new Font(BrandTheme.FontFamily, 9f);

            var root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
                Padding = new Padding(10, 10, 10, 0),
                BackColor = BrandTheme.BgDeep,
            };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 74F));  // header
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 38F));  // drawing bar
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));  // transcript

            root.Controls.Add(BuildHeader(), 0, 0);
            root.Controls.Add(BuildDrawingBar(), 0, 1);

            // ── Transcript (RichTextBox) ───────────────────────────────────
            transcript = new RichTextBox
            {
                Dock = DockStyle.Fill,
                BackColor = BrandTheme.BgPanel,
                ForeColor = BrandTheme.TextPrimary,
                BorderStyle = BorderStyle.None,
                ReadOnly = true,
                Multiline = true,
                WordWrap = true,
                ScrollBars = RichTextBoxScrollBars.Vertical,
                Font = new Font(BrandTheme.FontFamily, 9.5f),
                DetectUrls = true,
                Margin = new Padding(0, 0, 0, 0),
                HideSelection = false,
            };
            var transcriptFrame = new RoundedPanel(BrandTheme.BgPanel, 12, BrandTheme.Border) { Dock = DockStyle.Fill, Padding = new Padding(8), Margin = new Padding(0) };
            transcriptFrame.Controls.Add(transcript);
            root.Controls.Add(transcriptFrame, 0, 2);

            // ── Composer + status strip ────────────────────────────────────
            // These are docked to the FORM, not placed in fixed TableLayoutPanel
            // rows. Docked edges are laid out before the fill region, so the
            // composer always reserves its full height first and can never be
            // squeezed off-screen by transcript growth, DPI row rounding, or a
            // short window — which is what kept clipping the Send button.
            var composer = BuildInputBar(out messageInput, out sendButton);

            var statusStrip = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 26,
                BackColor = BrandTheme.BgDeep,
                Padding = new Padding(10, 0, 10, 0),
            };
            statusStrip.Paint += (s, e) => { using (var pen = new Pen(BrandTheme.Border, 1f)) e.Graphics.DrawLine(pen, 0, 0, statusStrip.Width, 0); };
            statusStripLabel = new Label
            {
                Text = "Disconnected",
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                Font = new Font(BrandTheme.FontFamily, 8.5f),
                ForeColor = BrandTheme.AccentRed,
            };
            statusPill.Connected = false;
            statusStrip.Controls.Add(statusStripLabel);

            // Add order matters: the fill region goes in first so the docked rows
            // below claim their space ahead of it.
            this.Controls.Add(root);
            this.Controls.Add(composer);
            this.Controls.Add(statusStrip);

            // Guard against opening taller than the screen work area (high-DPI
            // machines could push the input row + Send button under the taskbar).
            this.Load += (s, e) => ClampToWorkingArea();

            busyTimer = new Timer { Interval = 450 };
            busyTimer.Tick += BusyTimer_Tick;

            UpdateSendEnabled();
        }

        // ── Header ─────────────────────────────────────────────────────────
        private Control BuildHeader()
        {
            var header = new RoundedPanel(BrandTheme.BgPanel, 12)
            {
                Dock = DockStyle.Fill, Padding = new Padding(14, 8, 12, 8), Margin = new Padding(0, 0, 0, 4),
            };
            var grid = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, BackColor = Color.Transparent, Margin = new Padding(0) };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

            var left = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 2, Margin = new Padding(0), BackColor = Color.Transparent };
            left.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
            left.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            var logo = new BrandLogo(15f) { BackColor = BrandTheme.BgPanel, Anchor = AnchorStyles.Left, Margin = new Padding(0) };
            logo.Size = logo.GetPreferredSize(Size.Empty);
            var subtitle = new Label { Text = SubtitleText, Font = new Font(BrandTheme.FontFamily, 8f), ForeColor = BrandTheme.TextMuted, AutoSize = true, Margin = new Padding(0), Anchor = AnchorStyles.Left };
            left.Controls.Add(logo, 0, 0);
            left.Controls.Add(subtitle, 0, 1);

            var right = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false,
                AutoSize = true, Margin = new Padding(0), Padding = new Padding(0, 6, 0, 0), BackColor = Color.Transparent,
            };
            settingsButton = new RoundedButton(BrandButtonStyle.Secondary) { Text = "⚙", Width = 32, Height = 28, Margin = new Padding(6, 0, 0, 0), Font = new Font(BrandTheme.FontFamily, 10f) };
            settingsButton.Click += (s, e) => { using (var f = new SettingsForm()) f.ShowDialog(this); };

            disconnectButton = new RoundedButton(BrandButtonStyle.Danger) { Text = "⏻", Width = 32, Height = 28, Margin = new Padding(6, 0, 0, 0), Font = new Font(BrandTheme.FontFamily, 10f) };
            disconnectButton.Click += (s, e) => DisconnectRequested?.Invoke(this, EventArgs.Empty);

            syncButton = new RoundedButton(BrandButtonStyle.Primary) { Text = "⇄ Sync", Width = 72, Height = 28, Margin = new Padding(6, 0, 0, 0) };
            syncButton.Click += SyncButton_Click;

            var tips = new ToolTip { InitialDelay = 350, ReshowDelay = 100 };
            tips.SetToolTip(settingsButton, "Settings");
            tips.SetToolTip(disconnectButton, "Disconnect from LandSurv.ai");
            tips.SetToolTip(syncButton, "Start or refresh live Sync");

            statusPill = new StatusPill { Margin = new Padding(0, 1, 0, 0), Connected = false };

            right.Controls.Add(settingsButton);
            right.Controls.Add(disconnectButton);
            right.Controls.Add(syncButton);
            right.Controls.Add(statusPill);

            grid.Controls.Add(left, 0, 0);
            grid.Controls.Add(right, 1, 0);
            header.Controls.Add(grid);
            return header;
        }

        private Control BuildDrawingBar()
        {
            var bar = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 1, Margin = new Padding(0, 6, 0, 6), BackColor = BrandTheme.BgDeep };
            bar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            bar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            bar.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 34F));

            var label = new Label { Text = "Active Drawing:", Font = new Font(BrandTheme.FontFamily, 8.5f), ForeColor = BrandTheme.TextMuted, AutoSize = true, Anchor = AnchorStyles.Left, Margin = new Padding(2, 0, 8, 0) };
            var selector = new ComboBox
            {
                Dock = DockStyle.Fill, BackColor = BrandTheme.BgControl, ForeColor = BrandTheme.TextPrimary,
                FlatStyle = FlatStyle.Flat, Font = new Font(BrandTheme.FontFamily, 8.5f),
                DropDownStyle = ComboBoxStyle.DropDownList, Margin = new Padding(0, 3, 0, 3),
            };
            selector.SelectedIndexChanged += DrawingSelector_SelectedIndexChanged;
            var refresh = new RoundedButton(BrandButtonStyle.Secondary) { Text = "↻", Dock = DockStyle.Fill, Margin = new Padding(6, 2, 0, 2), Font = new Font(BrandTheme.FontFamily, 9.5f) };
            refresh.Click += (s, e) => RefreshDrawingsRequested?.Invoke(this, EventArgs.Empty);

            bar.Controls.Add(label, 0, 0);
            bar.Controls.Add(selector, 1, 0);
            bar.Controls.Add(refresh, 2, 0);

            _drawingSelectorRef = selector;
            _refreshButtonRef = refresh;
            return bar;
        }

        private ComboBox _drawingSelectorRef;
        private Button _refreshButtonRef;

        /// <summary>
        /// The message composer. Returns a bottom-docked host with an explicit
        /// height, so the input and Send button own their space independently of
        /// the transcript layout and cannot be clipped by the window edge.
        /// </summary>
        private Control BuildInputBar(out TextBox input, out Button send)
        {
            var host = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 84,
                Padding = new Padding(10, 8, 10, 8),
                BackColor = BrandTheme.BgDeep,
            };

            send = new RoundedButton(BrandButtonStyle.Primary)
            {
                Text = "Send",
                Dock = DockStyle.Right,
                Width = 104,
                Margin = new Padding(0),
                Font = new Font(BrandTheme.FontFamily, 10f, FontStyle.Bold),
            };
            send.Click += (s, e) => TrySendMessage();

            var gap = new Panel { Dock = DockStyle.Right, Width = 8, BackColor = BrandTheme.BgDeep };

            input = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                WordWrap = true,
                AcceptsReturn = true,
                ScrollBars = ScrollBars.Vertical,
                Font = new Font(BrandTheme.FontFamily, 9.5f),
                BackColor = BrandTheme.BgControl,
                ForeColor = BrandTheme.TextPrimary,
                BorderStyle = BorderStyle.None,
                PlaceholderText = "Ask LandSurv.ai to count, label, draw…",
            };
            input.KeyDown += MessageInput_KeyDown;
            input.TextChanged += (s, e) => UpdateSendEnabled();

            // Rounded frame around the input (TextBox itself can't be rounded).
            var inputFrame = new RoundedPanel(BrandTheme.BgControl, 10, BrandTheme.Border)
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(10, 8, 10, 8),
                Margin = new Padding(0),
            };
            inputFrame.Controls.Add(input);

            // Fill first, then the docked Send column, so the button keeps its
            // full width and the input takes whatever remains.
            host.Controls.Add(inputFrame);
            host.Controls.Add(gap);
            host.Controls.Add(send);
            return host;
        }

        // ══════════════════════ Public API ══════════════════════

        public void AddMessage(string sender, string message)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired) { this.BeginInvoke(new Action<string, string>(AddMessage), sender, message); return; }

            message = message ?? "";
            var role = ResolveRole(sender, message);

            // System/warning/error de-dupe: collapse consecutive identical lines.
            if (role != MessageRole.User && role != MessageRole.Agent)
            {
                if (_lastSystemText == message && _lastSystemLineStart >= 0)
                {
                    _lastSystemRepeat++;
                    // Rewrite the tail of the last line with a ×N badge.
                    ReplaceFrom(_lastSystemLineStart, $"{RolePrefix(role)}{message}  ×{_lastSystemRepeat}", RoleColor(role));
                    ScrollToEnd();
                    return;
                }
                _lastSystemText = message;
                _lastSystemRepeat = 1;
            }
            else
            {
                _lastSystemText = null;
            }

            bool atBottom = IsScrolledToBottom();

            if (transcript.TextLength > 0) AppendText("\n", BrandTheme.TextMuted);
            _lastSystemLineStart = transcript.TextLength;

            // Timestamp
            AppendText($"[{DateTime.Now:h:mm tt}] ", Color.FromArgb(90, 116, 139));
            // Role label
            AppendText(RolePrefix(role), RoleColor(role), bold: true);
            // Body
            AppendText(message, role == MessageRole.User ? BrandTheme.TextPrimary
                : role == MessageRole.Agent ? BrandTheme.TextPrimary
                : RoleColor(role));

            if (atBottom) ScrollToEnd();
        }

        public void SetStatus(string status, bool isConnected)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired) { this.BeginInvoke(new Action<string, bool>(SetStatus), status, isConnected); return; }
            _connected = isConnected;
            _lastStatusText = string.IsNullOrWhiteSpace(status) ? "Ready" : status;
            if (!_busy) statusStripLabel.Text = _lastStatusText;
            statusStripLabel.ForeColor = isConnected ? BrandTheme.AccentGreen : BrandTheme.AccentRed;
            statusPill.Connected = isConnected;
            disconnectButton.Enabled = isConnected;
            UpdateSendEnabled();
        }

        public void SetBusy(bool busy)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired) { this.BeginInvoke(new Action<bool>(SetBusy), busy); return; }
            _busy = busy;
            if (busy) { _busyTick = 0; busyTimer.Start(); }
            else
            {
                busyTimer.Stop();
                statusStripLabel.Text = _lastStatusText;
                statusStripLabel.ForeColor = _connected ? BrandTheme.AccentGreen : BrandTheme.AccentRed;
            }
            UpdateSendEnabled();
        }

        /// <summary>Reflect the Live-sync on/off state on the toggle button.</summary>
        public void SetLiveSyncState(bool on)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired) { this.BeginInvoke(new Action<bool>(SetLiveSyncState), on); return; }
            _liveOn = on;
            if (syncButton != null)
            {
                syncButton.Text = on ? "● Sync" : "⇄ Sync";
                syncButton.SetButtonStyle(on ? BrandButtonStyle.Primary : BrandButtonStyle.Secondary);
            }
        }

        /// <summary>
        /// Keep the whole window (including the bottom input row + Send button)
        /// inside the current screen's working area. Prevents the bottom being
        /// clipped by the taskbar when the form opens tall on smaller/high-DPI
        /// displays.
        /// </summary>
        private void ClampToWorkingArea()
        {
            try
            {
                var wa = Screen.FromControl(this).WorkingArea;
                int h = Math.Min(this.Height, Math.Max(480, wa.Height - 16));
                int w = Math.Min(this.Width, wa.Width);
                if (h != this.Height || w != this.Width) this.Size = new Size(w, h);

                int x = this.Left, y = this.Top;
                if (this.Bottom > wa.Bottom) y = Math.Max(wa.Top, wa.Bottom - this.Height);
                if (this.Right > wa.Right) x = Math.Max(wa.Left, wa.Right - this.Width);
                if (y < wa.Top) y = wa.Top;
                if (x < wa.Left) x = wa.Left;
                if (x != this.Left || y != this.Top) this.Location = new Point(x, y);
                this.MaximumSize = new Size(wa.Width, Math.Max(480, wa.Height - 16));
            }
            catch { /* best-effort layout guard */ }
        }

        public void UpdateDrawingsList(List<DrawingItem> drawings)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired) { this.BeginInvoke(new Action<List<DrawingItem>>(UpdateDrawingsList), drawings); return; }
            _suppressDrawingEvents = true;
            try
            {
                _drawingSelectorRef.Items.Clear();
                foreach (var d in drawings)
                {
                    _drawingSelectorRef.Items.Add(d);
                    if (d.IsActive) _drawingSelectorRef.SelectedItem = d;
                }
            }
            finally { _suppressDrawingEvents = false; }
        }

        public string GetSelectedDrawing() => (_drawingSelectorRef.SelectedItem as DrawingItem)?.FullPath;

        public void FocusInput() { if (!this.IsDisposed) messageInput.Focus(); }

        // ══════════════════════ Internals ══════════════════════

        private enum MessageRole { User, Agent, System, Warning, Error }

        private static MessageRole ResolveRole(string sender, string message)
        {
            if (sender == "You") return MessageRole.User;
            if (sender == "AI Agent" || sender == "Agent" || sender == "Assistant") return MessageRole.Agent;
            if (!string.IsNullOrEmpty(message))
            {
                if (message.StartsWith("Error", StringComparison.OrdinalIgnoreCase) || message.StartsWith("✗") || message.StartsWith("✕")) return MessageRole.Error;
                if (message.StartsWith("⚠") || message.StartsWith("!")) return MessageRole.Warning;
            }
            return MessageRole.System;
        }

        private static string RolePrefix(MessageRole role)
        {
            switch (role)
            {
                case MessageRole.User: return "You:  ";
                case MessageRole.Agent: return "LandSurv.ai:  ";
                case MessageRole.Error: return "Error:  ";
                case MessageRole.Warning: return "Note:  ";
                default: return "";
            }
        }

        private static Color RoleColor(MessageRole role)
        {
            switch (role)
            {
                case MessageRole.User: return BrandTheme.AccentCyan;
                case MessageRole.Agent: return BrandTheme.AccentGreen;
                case MessageRole.Error: return BrandTheme.AccentRed;
                case MessageRole.Warning: return BrandTheme.AccentAmber;
                default: return BrandTheme.TextMuted;
            }
        }

        private void AppendText(string text, Color color, bool bold = false)
        {
            transcript.SelectionStart = transcript.TextLength;
            transcript.SelectionLength = 0;
            transcript.SelectionColor = color;
            if (bold) transcript.SelectionFont = new Font(transcript.Font, FontStyle.Bold);
            transcript.AppendText(text);
            if (bold) transcript.SelectionFont = transcript.Font;
        }

        private void ReplaceFrom(int start, string newText, Color color)
        {
            transcript.SelectionStart = start;
            transcript.SelectionLength = transcript.TextLength - start;
            transcript.SelectionColor = color;
            transcript.SelectedText = newText;
        }

        private bool IsScrolledToBottom()
        {
            // Approximate: if the caret's last visible char is near the end.
            int firstVisible = transcript.GetCharIndexFromPosition(new Point(1, 1));
            int lastVisible = transcript.GetCharIndexFromPosition(new Point(1, transcript.ClientSize.Height - 2));
            return lastVisible >= transcript.TextLength - 2 || transcript.TextLength == 0;
        }

        private void ScrollToEnd()
        {
            transcript.SelectionStart = transcript.TextLength;
            transcript.SelectionLength = 0;
            transcript.ScrollToCaret();
        }

        private void TrySendMessage()
        {
            string message = messageInput.Text.Trim();
            if (string.IsNullOrWhiteSpace(message)) return;
            if (!_connected) { AddMessage("System", "Error: Not connected to LandSurv.ai. Reconnect, then try again."); return; }
            messageInput.Clear();
            messageInput.Focus();
            SendMessageToServer?.Invoke(this, message);
        }

        private void UpdateSendEnabled()
        {
            sendButton.Enabled = _connected && !_busy;
        }

        private void SyncButton_Click(object sender, EventArgs e)
        {
            if (!_connected) { AddMessage("System", "Error: Not connected to LandSurv.ai. Connect before syncing."); return; }
            SyncRequested?.Invoke(this, EventArgs.Empty);
        }

        private void BusyTimer_Tick(object sender, EventArgs e)
        {
            _busyTick = (_busyTick + 1) % 4;
            statusStripLabel.Text = "Agent is working" + new string('.', _busyTick);
            statusStripLabel.ForeColor = BrandTheme.AccentCyan;
        }

        private void DrawingSelector_SelectedIndexChanged(object sender, EventArgs e)
        {
            if (_suppressDrawingEvents) return;
            if (((ComboBox)sender).SelectedItem is DrawingItem item && !item.IsActive)
                DrawingSelected?.Invoke(this, item.FullPath);
        }

        private void MessageInput_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.KeyCode == Keys.Enter && !e.Shift) { e.SuppressKeyPress = true; TrySendMessage(); }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; this.Hide(); return; }
            base.OnFormClosing(e);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) { busyTimer?.Stop(); busyTimer?.Dispose(); }
            base.Dispose(disposing);
        }
    }

    /// <summary>Drawing item for the active-drawing ComboBox.</summary>
    public class DrawingItem
    {
        public string Name { get; set; }
        public string FullPath { get; set; }
        public bool IsActive { get; set; }
        public int LayerCount { get; set; }

        public override string ToString()
        {
            string activeMarker = IsActive ? "● " : "  ";
            string layerInfo = LayerCount >= 0 ? $" ({LayerCount} layers)" : "";
            return $"{activeMarker}{Name}{layerInfo}";
        }
    }
}
