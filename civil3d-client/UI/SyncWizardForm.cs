using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Threading;
using System.Windows.Forms;
using LandsurvConnector.Sync;

namespace LandsurvConnector.UI
{
    /// <summary>
    /// Sync Wizard — the in-CAD half of the LandSurv.ai ⇄ Civil 3D sync engine.
    ///
    /// Four steps:
    ///   1. Direction — per-category question ("Use layers from CAD / from
    ///      LandSurv.ai / merge them together") with the same wording on both ends.
    ///   2. Preview — full diff grid with per-item action overrides.
    ///   3. Confirm — summary counts; typed DELETE confirmation when deletes exist.
    ///   4. Apply — live progress, cancellable; results report with backup path.
    ///
    /// The wizard never touches AutoCAD itself: ApplyRequested is handled by
    /// CivilAgent, which runs SyncApplier on the main thread via ThreadMarshaler.
    /// </summary>
    public class SyncWizardForm : Form
    {
        // ── Inputs ───────────────────────────────────────────────────────────
        private readonly List<CategoryDiffResult> _diffs;
        private readonly Dictionary<string, string> _directions = new Dictionary<string, string>();
        private readonly Dictionary<string, Dictionary<string, string>> _overrides
            = new Dictionary<string, Dictionary<string, string>>();

        // ── Chrome ───────────────────────────────────────────────────────────
        private readonly Panel stepHost;
        private readonly Label stepTitleLabel;
        private readonly Button backButton;
        private readonly Button nextButton;
        private readonly Button cancelButton;
        private int _step;

        // Step panels
        private Panel directionPanel;
        private Panel previewPanel;
        private Panel confirmPanel;
        private Panel progressPanel;

        // Preview step controls
        private readonly List<Button> previewTabButtons = new List<Button>();
        private string _previewCategory;
        private DataGridView previewGrid;

        // Progress step controls
        private ProgressBar progressBar;
        private Label progressLabel;
        private ListBox progressLog;
        private bool _applyRunning;
        private CancellationTokenSource _applyCts;
        public bool ApplyCompletedSuccessfully { get; private set; }

        /// <summary>Raised when the user confirms Apply. CivilAgent executes the plan.</summary>
        public event EventHandler<SyncApplyEventArgs> ApplyRequested;

        public sealed class SyncApplyEventArgs : EventArgs
        {
            public SyncApplyPlan Plan { get; set; }
            public CancellationTokenSource Cancellation { get; set; }
        }

        private static readonly (string id, string title, string question)[] CategoryMeta =
        {
            ("points", "Points", "Which points should be used?"),
            ("layers", "Layers", "Which layers should be used?"),
            ("linework", "Linework (incl. curves)", "Which linework should be used?"),
            ("annotation", "Annotation", "Which annotations should be used?"),
            ("symbols", "Symbols / Blocks", "Which symbol definitions should be used?"),
        };

        public SyncWizardForm(List<CategoryDiffResult> diffs, string drawingName)
        {
            _diffs = diffs ?? new List<CategoryDiffResult>();

            this.Text = "LandSurv.ai Sync";
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.Sizable;
            this.MinimizeBox = false;
            this.MaximizeBox = true;
            this.BackColor = BrandTheme.BgDeep;
            this.ForeColor = BrandTheme.TextPrimary;
            this.AutoScaleMode = AutoScaleMode.Dpi;
            this.AutoScaleDimensions = new SizeF(96F, 96F);
            this.ClientSize = new Size(760, 640);
            this.MinimumSize = new Size(640, 540);
            this.Font = new Font(BrandTheme.FontFamily, 9f);

            var root = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                ColumnCount = 1,
                RowCount = 3,
                Padding = new Padding(12),
                BackColor = BrandTheme.BgDeep,
            };
            root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 56F));
            root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
            root.RowStyles.Add(new RowStyle(SizeType.Absolute, 46F));

            // Header
            var header = new TableLayoutPanel
            {
                Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1,
                BackColor = BrandTheme.BgPanel, Padding = new Padding(14, 8, 14, 8), Margin = new Padding(0),
            };
            header.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
            header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
            var logo = new BrandLogo(13f) { BackColor = BrandTheme.BgPanel, Anchor = AnchorStyles.Left };
            logo.Size = logo.GetPreferredSize(Size.Empty);
            stepTitleLabel = new Label
            {
                Text = "",
                Font = new Font(BrandTheme.FontFamily, 11f, FontStyle.Bold),
                ForeColor = BrandTheme.TextPrimary,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleRight,
            };
            header.Controls.Add(logo, 0, 0);
            header.Controls.Add(stepTitleLabel, 1, 0);

            stepHost = new Panel { Dock = DockStyle.Fill, BackColor = BrandTheme.BgDeep, Padding = new Padding(0, 10, 0, 10) };

            // Footer
            var footer = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft,
                WrapContents = false, BackColor = BrandTheme.BgDeep, Margin = new Padding(0),
            };
            nextButton = new Button { Text = "Next →", Width = 110, Height = 32, Margin = new Padding(6, 4, 0, 4) };
            BrandTheme.StyleButton(nextButton, primary: true);
            nextButton.Click += Next_Click;
            backButton = new Button { Text = "← Back", Width = 90, Height = 32, Margin = new Padding(6, 4, 0, 4) };
            BrandTheme.StyleButton(backButton, primary: false);
            backButton.Click += Back_Click;
            cancelButton = new Button { Text = "Cancel", Width = 90, Height = 32, Margin = new Padding(6, 4, 0, 4) };
            BrandTheme.StyleButton(cancelButton, primary: false);
            cancelButton.Click += Cancel_Click;
            footer.Controls.Add(nextButton);
            footer.Controls.Add(backButton);
            footer.Controls.Add(cancelButton);

            root.Controls.Add(header, 0, 0);
            root.Controls.Add(stepHost, 0, 1);
            root.Controls.Add(footer, 0, 2);
            this.Controls.Add(root);

            BuildDirectionPanel();
            BuildPreviewPanel();
            BuildConfirmPanel();
            BuildProgressPanel();
            ShowStep(0);
        }

        // ════════════════════ Step 1: Direction ══════════════════════════════

        private void BuildDirectionPanel()
        {
            directionPanel = new Panel { Dock = DockStyle.Fill, AutoScroll = true, BackColor = BrandTheme.BgDeep };

            var stack = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                BackColor = BrandTheme.BgDeep,
            };

            var intro = new Label
            {
                Text = "Choose what to sync and which side wins for each category. "
                     + "Nothing is deleted or overwritten without your explicit choice.",
                AutoSize = true,
                MaximumSize = new Size(680, 0),
                Font = new Font(BrandTheme.FontFamily, 9f),
                ForeColor = BrandTheme.TextMuted,
                Margin = new Padding(4, 4, 4, 14),
            };
            stack.Controls.Add(intro);

            foreach (var (id, title, question) in CategoryMeta)
            {
                var diff = _diffs.FirstOrDefault(d => d.Category == id);
                int pending = diff == null ? 0
                    : diff.Counts.Where(kv => kv.Key != SyncItemState.Equal).Sum(kv => kv.Value);

                var group = new GroupBox
                {
                    Text = $"{title}  —  {(pending == 0 ? "in sync" : $"{pending} difference{(pending == 1 ? "" : "s")}")}",
                    Width = 690,
                    Height = pending == 0 ? 56 : 118,
                    Font = new Font(BrandTheme.FontFamily, 9f, FontStyle.Bold),
                    ForeColor = pending == 0 ? BrandTheme.TextMuted : BrandTheme.TextPrimary,
                    BackColor = BrandTheme.BgDeep,
                    Margin = new Padding(4, 4, 4, 10),
                };

                if (pending == 0)
                {
                    // In sync: no choice to make — show a single muted note instead of
                    // disabled radios (which render unreadably dark).
                    group.Controls.Add(new Label
                    {
                        Text = "✓ Both sides agree — nothing to do.",
                        Location = new Point(24, 26),
                        AutoSize = true,
                        Font = new Font(BrandTheme.FontFamily, 9f),
                        ForeColor = BrandTheme.TextMuted,
                    });
                    stack.Controls.Add(group);
                    continue;
                }

                var questionLabel = new Label
                {
                    Text = question,
                    Location = new Point(12, 24),
                    AutoSize = true,
                    Font = new Font(BrandTheme.FontFamily, 9f),
                    ForeColor = BrandTheme.TextMuted,
                };
                group.Controls.Add(questionLabel);

                string[] options = { "merge", "cad-wins", "lsai-wins" };
                string[] labels =
                {
                    "Merge them together (safest — creates missing on both sides)",
                    "Use " + Singular(title) + " from CAD (updates LandSurv.ai)",
                    "Use " + Singular(title) + " from LandSurv.ai (updates CAD)",
                };

                _directions[id] = "merge";
                for (int i = 0; i < options.Length; i++)
                {
                    string optionValue = options[i];
                    var radio = new RadioButton
                    {
                        Text = labels[i],
                        Location = new Point(24, 50 + i * 22),
                        AutoSize = true,
                        Font = new Font(BrandTheme.FontFamily, 9f),
                        ForeColor = BrandTheme.TextPrimary,
                        Checked = i == 0,
                        Tag = id,
                    };
                    radio.CheckedChanged += (s, e) =>
                    {
                        if (((RadioButton)s).Checked) _directions[(string)((RadioButton)s).Tag] = optionValue;
                    };
                    group.Controls.Add(radio);
                }

                stack.Controls.Add(group);
            }

            directionPanel.Controls.Add(stack);
        }

        private static string Singular(string categoryTitle)
        {
            switch (categoryTitle)
            {
                case "Points": return "points";
                case "Layers": return "layers";
                case "Linework (incl. curves)": return "linework";
                case "Annotation": return "annotations";
                default: return "symbols";
            }
        }

        // ════════════════════ Step 2: Preview ════════════════════════════════

        private void BuildPreviewPanel()
        {
            previewPanel = new Panel { Dock = DockStyle.Fill, BackColor = BrandTheme.BgDeep };

            var tabs = new FlowLayoutPanel
            {
                Dock = DockStyle.Top, Height = 34, WrapContents = false,
                FlowDirection = FlowDirection.LeftToRight, BackColor = BrandTheme.BgDeep,
            };

            foreach (var (id, title, _) in CategoryMeta)
            {
                var diff = _diffs.FirstOrDefault(d => d.Category == id);
                int pending = diff == null ? 0
                    : diff.Counts.Where(kv => kv.Key != SyncItemState.Equal).Sum(kv => kv.Value);
                var tab = new Button
                {
                    Text = pending == 0 ? title : $"{title} ({pending})",
                    Height = 28,
                    Width = 140,
                    Margin = new Padding(0, 0, 6, 0),
                    Tag = id,
                    Enabled = pending > 0,
                };
                BrandTheme.StyleButton(tab, primary: false);
                tab.Click += (s, e) => SelectPreviewCategory((string)((Button)s).Tag);
                previewTabButtons.Add(tab);
                tabs.Controls.Add(tab);
            }

            previewGrid = new DataGridView
            {
                Dock = DockStyle.Fill,
                ReadOnly = true,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                AllowUserToResizeRows = false,
                RowHeadersVisible = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                MultiSelect = true,
                BackgroundColor = BrandTheme.BgDeep,
                BorderStyle = BorderStyle.None,
                GridColor = BrandTheme.Border,
                EnableHeadersVisualStyles = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                Font = new Font(BrandTheme.FontFamily, 8.5f),
            };
            previewGrid.ColumnHeadersDefaultCellStyle = new DataGridViewCellStyle
            {
                BackColor = BrandTheme.BgPanel,
                ForeColor = BrandTheme.TextMuted,
                Font = new Font(BrandTheme.FontFamily, 8.5f, FontStyle.Bold),
                SelectionBackColor = BrandTheme.BgPanel,
            };
            previewGrid.DefaultCellStyle = new DataGridViewCellStyle
            {
                BackColor = BrandTheme.BgPanel,
                ForeColor = BrandTheme.TextPrimary,
                SelectionBackColor = Color.FromArgb(60, 6, 182, 212),
                SelectionForeColor = BrandTheme.TextPrimary,
            };
            previewGrid.Columns.Add("key", "Item");
            previewGrid.Columns.Add("state", "State");
            previewGrid.Columns.Add("action", "Planned Action");
            previewGrid.Columns.Add("details", "Details");
            previewGrid.Columns["key"].FillWeight = 22;
            previewGrid.Columns["state"].FillWeight = 12;
            previewGrid.Columns["action"].FillWeight = 16;
            previewGrid.Columns["details"].FillWeight = 50;

            // Per-selection action override buttons
            var overridesBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom, Height = 68, WrapContents = true,
                FlowDirection = FlowDirection.LeftToRight, BackColor = BrandTheme.BgDeep,
                Padding = new Padding(0, 6, 0, 0),
            };
            var hint = new Label
            {
                Text = "Selected rows:",
                AutoSize = true,
                ForeColor = BrandTheme.TextMuted,
                Margin = new Padding(2, 8, 8, 0),
            };
            overridesBar.Controls.Add(hint);
            AddOverrideButton(overridesBar, "Use CAD version", "cad", width: 132);
            AddOverrideButton(overridesBar, "Use LandSurv.ai version", "lsai", width: 164);
            AddOverrideButton(overridesBar, "Skip", "skip", width: 64);
            AddOverrideButton(overridesBar, "Delete from CAD…", "delete-cad", dangerous: true, width: 142);
            AddOverrideButton(overridesBar, "Delete from LandSurv.ai…", "delete-lsai", dangerous: true, width: 172);

            previewPanel.Controls.Add(previewGrid);
            previewPanel.Controls.Add(tabs);
            previewPanel.Controls.Add(overridesBar);
        }

        private void AddOverrideButton(FlowLayoutPanel bar, string text, string action, bool dangerous = false, int width = 140)
        {
            var btn = new Button { Text = text, Height = 26, Width = width, Margin = new Padding(0, 4, 6, 0) };
            BrandTheme.StyleButton(btn, primary: false);
            if (dangerous)
            {
                btn.ForeColor = BrandTheme.AccentRed;
                btn.FlatAppearance.BorderColor = BrandTheme.AccentRed;
            }
            btn.Click += (s, e) => ApplyOverrideToSelection(action);
            bar.Controls.Add(btn);
        }

        private void SelectPreviewCategory(string category)
        {
            _previewCategory = category;
            foreach (var tab in previewTabButtons)
            {
                bool active = (string)tab.Tag == category;
                tab.BackColor = active ? BrandTheme.AccentCyan : BrandTheme.BgControl;
                tab.ForeColor = active ? Color.White : BrandTheme.TextPrimary;
            }
            RepopulatePreviewGrid();
        }

        private void RepopulatePreviewGrid()
        {
            previewGrid.Rows.Clear();
            var diff = _diffs.FirstOrDefault(d => d.Category == _previewCategory);
            if (diff == null) return;

            var overrides = _overrides.TryGetValue(_previewCategory, out var ov) ? ov : null;
            string direction = _directions.TryGetValue(_previewCategory, out var d) ? d : "merge";
            var plan = SyncEngine.BuildCategoryPlan(diff, direction, overrides);
            var actionByKey = plan.Entries.ToDictionary(e => e.Key, e => e);

            foreach (var entry in diff.Entries)
            {
                if (entry.State == SyncItemState.Equal) continue;
                var planEntry = actionByKey[entry.Key];
                string details = entry.FieldDiffs != null && entry.FieldDiffs.Count > 0
                    ? string.Join("; ", entry.FieldDiffs.Take(3))
                    : DescribeSides(entry);
                int row = previewGrid.Rows.Add(entry.Key, entry.State.ToWire(), planEntry.Action, details);
                previewGrid.Rows[row].Tag = entry.Key;
                if (entry.State == SyncItemState.Conflict)
                {
                    previewGrid.Rows[row].DefaultCellStyle.ForeColor = BrandTheme.AccentAmber;
                }
                else if (planEntry.Action.StartsWith("delete-"))
                {
                    previewGrid.Rows[row].DefaultCellStyle.ForeColor = BrandTheme.AccentRed;
                }
            }
        }

        private static string DescribeSides(SyncDiffEntry entry)
        {
            switch (entry.State)
            {
                case SyncItemState.CadOnly: return "Exists only in CAD";
                case SyncItemState.LsaiOnly: return "Exists only in LandSurv.ai";
                case SyncItemState.Conflict: return "Changed on BOTH sides since last sync";
                default: return "Differs between CAD and LandSurv.ai";
            }
        }

        private void ApplyOverrideToSelection(string actionKind)
        {
            if (_previewCategory == null || previewGrid.SelectedRows.Count == 0) return;
            if (!_overrides.TryGetValue(_previewCategory, out var map))
            {
                map = new Dictionary<string, string>();
                _overrides[_previewCategory] = map;
            }

            foreach (DataGridViewRow row in previewGrid.SelectedRows)
            {
                string key = (string)row.Tag;
                var entry = _diffs.First(d => d.Category == _previewCategory).Entries.First(e => e.Key == key);

                // Translate the friendly button into a concrete action valid for this state.
                string action = ResolveOverrideAction(entry.State, actionKind);
                if (action == null) continue;
                map[key] = action;
            }
            RepopulatePreviewGrid();
        }

        /// <summary>Translate "Use CAD/LSAI/Skip/Delete" intent into a valid action for the item's state.</summary>
        internal static string ResolveOverrideAction(SyncItemState state, string kind)
        {
            switch (kind)
            {
                case "skip": return "skip";
                case "cad": // use the CAD version → push CAD truth to LSAI
                    return state == SyncItemState.LsaiOnly ? "skip"
                        : state == SyncItemState.CadOnly ? "create-lsai"
                        : "update-lsai";
                case "lsai": // use the LSAI version → push LSAI truth to CAD
                    return state == SyncItemState.CadOnly ? "skip"
                        : state == SyncItemState.LsaiOnly ? "create-cad"
                        : "update-cad";
                case "delete-cad":
                    return state == SyncItemState.LsaiOnly ? null : "delete-cad";
                case "delete-lsai":
                    return state == SyncItemState.CadOnly ? null : "delete-lsai";
                default:
                    return null;
            }
        }

        // ════════════════════ Step 3: Confirm ════════════════════════════════

        private TextBox deleteConfirmInput;
        private Label confirmSummaryLabel;

        private void BuildConfirmPanel()
        {
            confirmPanel = new Panel { Dock = DockStyle.Fill, BackColor = BrandTheme.BgDeep };

            confirmSummaryLabel = new Label
            {
                Dock = DockStyle.Top,
                Height = 260,
                Font = new Font("Consolas", 9.5f),
                ForeColor = BrandTheme.TextPrimary,
                BackColor = BrandTheme.BgPanel,
                Padding = new Padding(12),
            };

            var deleteWarnLabel = new Label
            {
                Text = "This plan includes DELETIONS. Type DELETE below to confirm.",
                Dock = DockStyle.Top,
                Height = 28,
                Font = new Font(BrandTheme.FontFamily, 9.5f, FontStyle.Bold),
                ForeColor = BrandTheme.AccentRed,
                TextAlign = ContentAlignment.MiddleLeft,
                Visible = false,
            };
            deleteWarnLabel.Name = "deleteWarnLabel";

            deleteConfirmInput = new TextBox
            {
                Dock = DockStyle.Top,
                Height = 30,
                Font = new Font("Consolas", 11f),
                BackColor = BrandTheme.BgControl,
                ForeColor = BrandTheme.TextPrimary,
                BorderStyle = BorderStyle.FixedSingle,
                Visible = false,
            };
            deleteConfirmInput.Name = "deleteConfirmInput";
            deleteConfirmInput.TextChanged += (s, e) => UpdateApplyEnabled();

            confirmPanel.Controls.Add(deleteConfirmInput);
            confirmPanel.Controls.Add(deleteWarnLabel);
            confirmPanel.Controls.Add(confirmSummaryLabel);
        }

        private int _pendingDeletes;
        private int _pendingDeletesMaxCategory;

        private void PrepareConfirmStep()
        {
            var plan = BuildPlan();
            var (creates, updates, deletes, skips) = SyncEngine.SummarizePlan(plan);
            _pendingDeletes = deletes;
            _pendingDeletesMaxCategory = plan.Categories
                .Select(c => c.Entries.Count(e => e.Action.StartsWith("delete-")))
                .Concat(new[] { 0 }).Max();

            var lines = new List<string>
            {
                $"  SYNC PLAN SUMMARY",
                $"  ─────────────────────────────────────────────",
                $"  Create:   {creates,4}   (new items)",
                $"  Update:   {updates,4}   (existing items overwritten on one side)",
                $"  Delete:   {deletes,4}   (explicitly chosen by you)",
                $"  Skip:     {skips,4}   (untouched)",
                $"",
                $"  Per-category direction:",
            };
            foreach (var (id, title, _) in CategoryMeta)
            {
                var diff = _diffs.FirstOrDefault(d => d.Category == id);
                if (diff == null) continue;
                int pending = diff.Counts.Where(kv => kv.Key != SyncItemState.Equal).Sum(kv => kv.Value);
                if (pending == 0) continue;
                string dir = _directions.TryGetValue(id, out var d2) ? d2 : "merge";
                lines.Add($"    {title,-26} {dir}");
            }
            lines.Add("");
            lines.Add("  A backup of the current CAD state is written before");
            lines.Add("  anything changes (%%APPDATA%%\\LandsurvConnector\\backups)."
                .Replace("%%APPDATA%%", "%APPDATA%"));
            confirmSummaryLabel.Text = string.Join("\n", lines);

            bool needsTypedConfirm = _pendingDeletes > 0;
            var warn = confirmPanel.Controls.Find("deleteWarnLabel", false)[0];
            var input = confirmPanel.Controls.Find("deleteConfirmInput", false)[0];
            warn.Visible = needsTypedConfirm;
            input.Visible = needsTypedConfirm;
            ((TextBox)input).Text = "";
            UpdateApplyEnabled();
        }

        private void UpdateApplyEnabled()
        {
            if (_pendingDeletes > 0)
            {
                nextButton.Enabled = deleteConfirmInput.Text.Trim() == "DELETE";
            }
            else
            {
                nextButton.Enabled = true;
            }
        }

        private SyncApplyPlan BuildPlan()
        {
            var plan = new SyncApplyPlan
            {
                PlanId = $"plan-{DateTime.UtcNow:yyyyMMddHHmmss}",
            };
            foreach (var diff in _diffs)
            {
                _overrides.TryGetValue(diff.Category, out var ov);
                string direction = _directions.TryGetValue(diff.Category, out var d) ? d : "merge";
                var categoryPlan = SyncEngine.BuildCategoryPlan(diff, direction, ov);
                if (categoryPlan.Entries.Count > 0) plan.Categories.Add(categoryPlan);
            }
            return plan;
        }

        // ════════════════════ Step 4: Apply / Results ════════════════════════

        private void BuildProgressPanel()
        {
            progressPanel = new Panel { Dock = DockStyle.Fill, BackColor = BrandTheme.BgDeep };

            progressLabel = new Label
            {
                Text = "Applying…",
                Dock = DockStyle.Top,
                Height = 26,
                Font = new Font(BrandTheme.FontFamily, 9.5f, FontStyle.Bold),
                ForeColor = BrandTheme.TextPrimary,
            };
            progressBar = new ProgressBar
            {
                Dock = DockStyle.Top,
                Height = 22,
                Minimum = 0,
                Maximum = 100,
                Style = ProgressBarStyle.Continuous,
            };
            progressLog = new ListBox
            {
                Dock = DockStyle.Fill,
                BackColor = BrandTheme.BgPanel,
                ForeColor = BrandTheme.TextPrimary,
                BorderStyle = BorderStyle.None,
                Font = new Font("Consolas", 8.5f),
                IntegralHeight = false,
            };

            progressPanel.Controls.Add(progressLog);
            progressPanel.Controls.Add(progressBar);
            progressPanel.Controls.Add(progressLabel);
        }

        /// <summary>Called by the apply host (CivilAgent) to stream progress.</summary>
        public void ReportProgress(SyncProgressInfo info)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<SyncProgressInfo>(ReportProgress), info);
                return;
            }
            if (info.Total > 0)
            {
                progressBar.Maximum = info.Total;
                progressBar.Value = Math.Min(info.Current, info.Total);
            }
            progressLabel.Text = $"{info.Phase}: {info.Current}/{info.Total} — {info.Message}";
            progressLog.Items.Add($"{info.Phase,-12} {info.Message}");
            progressLog.TopIndex = Math.Max(0, progressLog.Items.Count - 1);
        }

        /// <summary>Called by the apply host when the run finishes (or fails).</summary>
        public void ReportApplyComplete(int succeeded, int failed, int skipped, string backupPath, string lsaiNote)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<int, int, int, string, string>(ReportApplyComplete),
                    succeeded, failed, skipped, backupPath, lsaiNote);
                return;
            }

            _applyRunning = false;
            ApplyCompletedSuccessfully = failed == 0;
            progressLabel.Text = failed == 0
                ? $"✓ Sync complete — {succeeded} applied, {skipped} skipped"
                : $"⚠ Sync finished with {failed} failure(s) — {succeeded} applied, {skipped} skipped";
            progressLabel.ForeColor = failed == 0 ? BrandTheme.AccentGreen : BrandTheme.AccentAmber;

            if (!string.IsNullOrEmpty(backupPath))
            {
                progressLog.Items.Add("");
                progressLog.Items.Add($"Backup: {backupPath}");
            }
            if (!string.IsNullOrEmpty(lsaiNote))
            {
                progressLog.Items.Add(lsaiNote);
            }

            backButton.Enabled = false;
            cancelButton.Text = "Close";
            nextButton.Visible = false;

            // Applying a live-sync resolution must release the modeless wizard
            // immediately; otherwise the live timer remains blocked by the open form.
            BeginInvoke(new Action(() =>
            {
                if (!IsDisposed) Close();
            }));
        }

        /// <summary>Called by the apply host if the run died with an exception.</summary>
        public void ReportApplyError(string error)
        {
            if (this.IsDisposed) return;
            if (this.InvokeRequired)
            {
                this.BeginInvoke(new Action<string>(ReportApplyError), error);
                return;
            }
            _applyRunning = false;
            progressLabel.Text = "✕ Sync failed";
            progressLabel.ForeColor = BrandTheme.AccentRed;
            progressLog.Items.Add($"ERROR: {error}");
            backButton.Enabled = false;
            cancelButton.Text = "Close";
            nextButton.Visible = false;
        }

        // ════════════════════ Navigation ═════════════════════════════════════

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            // Never close mid-apply — the user must cancel the sync first so the
            // progress/results lifecycle stays coherent.
            if (_applyRunning && e.CloseReason == CloseReason.UserClosing)
            {
                e.Cancel = true;
                progressLabel.Text = "Sync is running — use “Cancel Sync” first.";
                return;
            }
            base.OnFormClosing(e);
        }

        private void ShowStep(int step)
        {
            _step = step;
            stepHost.Controls.Clear();

            switch (step)
            {
                case 0:
                    stepTitleLabel.Text = "Step 1 of 4 — Choose what to sync";
                    stepHost.Controls.Add(directionPanel);
                    backButton.Enabled = false;
                    nextButton.Text = "Preview →";
                    nextButton.Enabled = true;
                    break;
                case 1:
                    stepTitleLabel.Text = "Step 2 of 4 — Review differences";
                    stepHost.Controls.Add(previewPanel);
                    backButton.Enabled = true;
                    nextButton.Text = "Review Plan →";
                    nextButton.Enabled = true;
                    var firstNonEmpty = CategoryMeta
                        .Select(c => c.id)
                        .FirstOrDefault(id =>
                        {
                            var diff = _diffs.FirstOrDefault(d => d.Category == id);
                            return diff != null && diff.Counts.Where(kv => kv.Key != SyncItemState.Equal).Sum(kv => kv.Value) > 0;
                        });
                    if (firstNonEmpty != null) SelectPreviewCategory(firstNonEmpty);
                    break;
                case 2:
                    stepTitleLabel.Text = "Step 3 of 4 — Confirm plan";
                    stepHost.Controls.Add(confirmPanel);
                    backButton.Enabled = true;
                    nextButton.Text = "Apply Sync";
                    nextButton.Visible = true;
                    PrepareConfirmStep();
                    break;
                case 3:
                    stepTitleLabel.Text = "Step 4 of 4 — Syncing";
                    stepHost.Controls.Add(progressPanel);
                    backButton.Enabled = false;
                    nextButton.Enabled = false;
                    StartApply();
                    break;
            }
        }

        private void StartApply()
        {
            if (_applyRunning) return;
            _applyRunning = true;
            _applyCts = new CancellationTokenSource();
            cancelButton.Text = "Cancel Sync";

            var plan = BuildPlan();
            ApplyRequested?.Invoke(this, new SyncApplyEventArgs { Plan = plan, Cancellation = _applyCts });
        }

        private void Next_Click(object sender, EventArgs e)
        {
            if (_step < 3) ShowStep(_step + 1);
        }

        private void Back_Click(object sender, EventArgs e)
        {
            if (_step > 0 && !_applyRunning) ShowStep(_step - 1);
        }

        private void Cancel_Click(object sender, EventArgs e)
        {
            if (_applyRunning)
            {
                _applyCts?.Cancel();
                progressLabel.Text = "Canceling… (current item finishes first)";
                return;
            }
            this.DialogResult = DialogResult.Cancel;
            this.Close();
        }
    }
}
