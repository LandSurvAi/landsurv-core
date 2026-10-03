using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace LandsurvConnector.UI
{
    /// <summary>
    /// Shared LandSurv.ai brand palette, drawing helpers, and brand controls.
    /// Single source of truth for connector UI styling so ChatForm, SettingsForm,
    /// and future dialogs stay visually consistent with the webapp.
    /// Colors match the webapp: slate #0F172A/#1E293B, cyan #06B6D4, green #22C55E.
    /// </summary>
    internal static class BrandTheme
    {
        internal static readonly Color BgDeep = Color.FromArgb(15, 23, 42);        // slate-900
        internal static readonly Color BgPanel = Color.FromArgb(30, 41, 59);       // slate-800
        internal static readonly Color BgControl = Color.FromArgb(30, 41, 59);     // slate-800
        internal static readonly Color Border = Color.FromArgb(51, 65, 85);        // slate-700
        internal static readonly Color BorderLight = Color.FromArgb(71, 85, 105);  // slate-600
        internal static readonly Color TextPrimary = Color.FromArgb(226, 232, 240);// slate-200
        internal static readonly Color TextMuted = Color.FromArgb(148, 163, 184);  // slate-400
        internal static readonly Color AccentCyan = Color.FromArgb(6, 182, 212);
        internal static readonly Color AccentCyanHover = Color.FromArgb(34, 211, 238);
        internal static readonly Color AccentCyanPressed = Color.FromArgb(8, 145, 178);
        internal static readonly Color AccentGreen = Color.FromArgb(34, 197, 94);
        internal static readonly Color AccentRed = Color.FromArgb(239, 68, 68);
        internal static readonly Color AccentAmber = Color.FromArgb(245, 158, 11);

        internal const string FontFamily = "Segoe UI";

        /// <summary>Creates a GraphicsPath for a rounded rectangle.</summary>
        internal static GraphicsPath RoundedRect(Rectangle bounds, int radius)
        {
            int d = Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height));
            var path = new GraphicsPath();
            if (d <= 0)
            {
                path.AddRectangle(bounds);
                return path;
            }
            path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
            path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
            path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
            path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
            path.CloseFigure();
            return path;
        }

        /// <summary>Styles a flat brand button (filled or outlined).</summary>
        internal static void StyleButton(Button button, bool primary)
        {
            button.FlatStyle = FlatStyle.Flat;
            button.Font = new Font(FontFamily, 9f, primary ? FontStyle.Bold : FontStyle.Regular);
            button.Cursor = Cursors.Hand;
            if (primary)
            {
                button.BackColor = AccentCyan;
                button.ForeColor = Color.White;
                button.FlatAppearance.BorderSize = 0;
                button.FlatAppearance.MouseOverBackColor = AccentCyanHover;
                button.FlatAppearance.MouseDownBackColor = AccentCyanPressed;
            }
            else
            {
                button.BackColor = BgControl;
                button.ForeColor = TextPrimary;
                button.FlatAppearance.BorderSize = 1;
                button.FlatAppearance.BorderColor = BorderLight;
                button.FlatAppearance.MouseOverBackColor = Border;
            }
        }
    }

    /// <summary>Button variants for the rounded brand button.</summary>
    internal enum BrandButtonStyle { Primary, Secondary, Danger }

    /// <summary>
    /// Anti-aliased rounded button in the LandSurv.ai style (soft fillets), with
    /// hover/press states. Replaces flat rectangular buttons for a more appealing look.
    /// </summary>
    internal sealed class RoundedButton : Button
    {
        private BrandButtonStyle _style;
        private readonly int _radius;
        private bool _hover;
        private bool _down;

        /// <summary>Swap the visual style at runtime (e.g., toggle on/off) and repaint.</summary>
        public void SetButtonStyle(BrandButtonStyle style)
        {
            if (_style == style) return;
            _style = style;
            ForeColor = _style == BrandButtonStyle.Primary ? Color.White
                : _style == BrandButtonStyle.Danger ? BrandTheme.AccentRed : BrandTheme.TextPrimary;
            Font = new Font(BrandTheme.FontFamily, 9f, _style == BrandButtonStyle.Primary ? FontStyle.Bold : FontStyle.Regular);
            Invalidate();
        }

        public RoundedButton(BrandButtonStyle style = BrandButtonStyle.Secondary, int radius = 8)
        {
            _style = style;
            _radius = radius;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor, true);
            FlatStyle = FlatStyle.Flat;
            FlatAppearance.BorderSize = 0;
            Cursor = Cursors.Hand;
            ForeColor = _style == BrandButtonStyle.Primary ? Color.White
                : _style == BrandButtonStyle.Danger ? BrandTheme.AccentRed : BrandTheme.TextPrimary;
            Font = new Font(BrandTheme.FontFamily, 9f, _style == BrandButtonStyle.Primary ? FontStyle.Bold : FontStyle.Regular);
            BackColor = Color.Transparent;
        }

        protected override void OnMouseEnter(EventArgs e) { _hover = true; Invalidate(); base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { _hover = false; _down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { _down = true; Invalidate(); base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { _down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnEnabledChanged(EventArgs e) { Invalidate(); base.OnEnabledChanged(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(this.Parent != null ? this.Parent.BackColor : BrandTheme.BgDeep);

            var rect = new Rectangle(0, 0, Width - 1, Height - 1);
            Color fill, border, text;
            bool hasBorder = false;

            if (!Enabled)
            {
                fill = BrandTheme.Border; border = BrandTheme.Border; text = BrandTheme.TextMuted;
            }
            else if (_style == BrandButtonStyle.Primary)
            {
                fill = _down ? BrandTheme.AccentCyanPressed : _hover ? BrandTheme.AccentCyanHover : BrandTheme.AccentCyan;
                border = fill; text = Color.White;
            }
            else if (_style == BrandButtonStyle.Danger)
            {
                fill = _down ? Color.FromArgb(80, BrandTheme.AccentRed) : _hover ? Color.FromArgb(50, BrandTheme.AccentRed) : Color.FromArgb(28, BrandTheme.AccentRed);
                border = BrandTheme.AccentRed; text = BrandTheme.AccentRed; hasBorder = true;
            }
            else
            {
                fill = _down ? BrandTheme.Border : _hover ? BrandTheme.Border : BrandTheme.BgControl;
                border = BrandTheme.BorderLight; text = BrandTheme.TextPrimary; hasBorder = true;
            }

            using (var path = BrandTheme.RoundedRect(rect, _radius))
            using (var fb = new SolidBrush(fill))
            {
                g.FillPath(fb, path);
                if (hasBorder) using (var pen = new Pen(border, 1f)) g.DrawPath(pen, path);
            }

            TextRenderer.DrawText(g, Text, Font, rect, Enabled ? text : BrandTheme.TextMuted,
                TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis);
        }
    }

    /// <summary>
    /// Anti-aliased rounded panel (soft fillets) that paints a filled rounded rect
    /// with an optional border. Host square children inside; when their BackColor
    /// matches the panel fill, the whole group reads as rounded.
    /// </summary>
    internal sealed class RoundedPanel : Panel
    {
        private readonly int _radius;
        private readonly Color _fill;
        private readonly Color _border;
        private readonly bool _hasBorder;

        public RoundedPanel(Color fill, int radius = 10, Color? border = null)
        {
            _fill = fill;
            _radius = radius;
            _hasBorder = border.HasValue;
            _border = border ?? fill;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Color.Transparent;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(this.Parent != null ? this.Parent.BackColor : BrandTheme.BgDeep);
            var rect = new Rectangle(0, 0, Width - 1, Height - 1);
            using (var path = BrandTheme.RoundedRect(rect, _radius))
            using (var fb = new SolidBrush(_fill))
            {
                g.FillPath(fb, path);
                if (_hasBorder) using (var pen = new Pen(_border, 1f)) g.DrawPath(pen, path);
            }
            base.OnPaint(e);
        }
    }

    /// <summary>
    /// Owner-drawn LandSurv.ai brand logo. Renders "Land" "Surv" ".ai" "™" as one
    /// measured run of text so kerning is correct by construction — replaces the
    /// previous approach of separate labels at hardcoded X offsets.
    /// </summary>
    internal sealed class BrandLogo : Control
    {
        private readonly float _fontSize;
        private readonly bool _showTrademark;

        public BrandLogo(float fontSize = 15f, bool showTrademark = true)
        {
            _fontSize = fontSize;
            _showTrademark = showTrademark;
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
            this.TabStop = false;
        }

        public override Size GetPreferredSize(Size proposedSize)
        {
            using (var g = this.CreateGraphics())
            {
                return Measure(g);
            }
        }

        private Size Measure(Graphics g)
        {
            using (var font = new Font(BrandTheme.FontFamily, _fontSize, FontStyle.Bold))
            using (var tmFont = new Font(BrandTheme.FontFamily, Math.Max(6f, _fontSize * 0.5f), FontStyle.Regular))
            {
                const TextFormatFlags flags = TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine;
                int w = 0;
                w += TextRenderer.MeasureText(g, "Land", font, Size.Empty, flags).Width;
                w += TextRenderer.MeasureText(g, "Surv", font, Size.Empty, flags).Width;
                w += TextRenderer.MeasureText(g, ".ai", font, Size.Empty, flags).Width;
                if (_showTrademark)
                {
                    w += 2 + TextRenderer.MeasureText(g, "™", tmFont, Size.Empty, flags).Width;
                }
                int h = TextRenderer.MeasureText(g, "LandSurv.ai", font, Size.Empty, flags).Height;
                return new Size(w, h);
            }
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            // Clear to a concrete background so the logo never shows a stray
            // white/default box. Prefer this control's own explicitly-set
            // BackColor (callers set it to match the container); fall back to the
            // nearest opaque ancestor color only when ours was left at the default.
            Color bg = this.BackColor;
            if (bg == Color.Empty || bg == SystemColors.Control || bg.A == 0)
            {
                var p = this.Parent;
                while (p != null && (p.BackColor.A == 0 || p.BackColor == Color.Empty)) p = p.Parent;
                bg = p != null ? p.BackColor : BrandTheme.BgPanel;
            }
            g.Clear(bg);
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
            using (var font = new Font(BrandTheme.FontFamily, _fontSize, FontStyle.Bold))
            using (var tmFont = new Font(BrandTheme.FontFamily, Math.Max(6f, _fontSize * 0.5f), FontStyle.Regular))
            {
                const TextFormatFlags flags = TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix
                    | TextFormatFlags.SingleLine | TextFormatFlags.PreserveGraphicsClipping;
                int x = 0;
                int baselineTop = 0;

                x = DrawRun(g, "Land", font, BrandTheme.TextPrimary, x, baselineTop, flags);
                x = DrawRun(g, "Surv", font, BrandTheme.AccentCyan, x, baselineTop, flags);
                x = DrawRun(g, ".ai", font, BrandTheme.AccentGreen, x, baselineTop, flags);
                if (_showTrademark)
                {
                    TextRenderer.DrawText(g, "™", tmFont, new Point(x + 2, baselineTop), BrandTheme.TextMuted, flags);
                }
            }
            base.OnPaint(e);
        }

        private static int DrawRun(Graphics g, string text, Font font, Color color, int x, int y, TextFormatFlags flags)
        {
            TextRenderer.DrawText(g, text, font, new Point(x, y), color, flags);
            return x + TextRenderer.MeasureText(g, text, font, Size.Empty, flags).Width;
        }
    }

    /// <summary>
    /// Rounded connection-status pill with a colored dot ("Connected" / "Disconnected").
    /// </summary>
    internal sealed class StatusPill : Control
    {
        private bool _connected;

        public bool Connected
        {
            get => _connected;
            set
            {
                if (_connected == value) return;
                _connected = value;
                this.Invalidate();
            }
        }

        public StatusPill()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor, true);
            this.Size = new Size(108, 26);
            this.TabStop = false;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(this.Parent?.BackColor ?? BrandTheme.BgPanel);

            var rect = new Rectangle(0, 0, this.Width - 1, this.Height - 1);
            Color dot = _connected ? BrandTheme.AccentGreen : BrandTheme.AccentRed;
            string text = _connected ? "Connected" : "Disconnected";

            using (var path = BrandTheme.RoundedRect(rect, rect.Height / 2))
            using (var fill = new SolidBrush(Color.FromArgb(_connected ? 40 : 60, dot)))
            using (var pen = new Pen(Color.FromArgb(160, dot), 1f))
            {
                g.FillPath(fill, path);
                g.DrawPath(pen, path);
            }

            int dotSize = 8;
            int dotX = 10;
            int dotY = (this.Height - dotSize) / 2;
            using (var dotBrush = new SolidBrush(dot))
            {
                g.FillEllipse(dotBrush, dotX, dotY, dotSize, dotSize);
            }

            using (var font = new Font(BrandTheme.FontFamily, 8f, FontStyle.Bold))
            {
                var textRect = new Rectangle(dotX + dotSize + 5, 0, this.Width - dotX - dotSize - 8, this.Height);
                TextRenderer.DrawText(g, text, font, textRect, _connected ? BrandTheme.AccentGreen : BrandTheme.AccentRed,
                    TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix);
            }
            base.OnPaint(e);
        }
    }
}
