using System;
using System.Windows.Forms;
using System.Drawing;

namespace LandsurvConnector.UI
{
    /// <summary>
    /// Settings dialog for Civil 3D plugin configuration - branded to match LandSurv.ai
    /// </summary>
    public class SettingsForm : Form
    {
        private TextBox sessionTokenInput;
        private Label statusLabel;
        private Button saveButton;
        private Button cancelButton;

        public string SessionToken { get; set; }

        public SettingsForm()
        {
            // Set colors BEFORE InitializeComponent so child controls that capture
            // this.BackColor (e.g. the BrandLogo) get the slate background, not the
            // default white — otherwise the logo renders on a white box.
            this.BackColor = Color.FromArgb(15, 23, 42);
            this.ForeColor = Color.FromArgb(226, 232, 240);
            InitializeComponent();
            this.Text = "LandSurv.ai - Settings";
            this.Width = 520;
            this.Height = 280;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            LoadCurrentSettings();
        }

        private void InitializeComponent()
        {
            // Header - owner-drawn brand logo (correct kerning) + "Settings" caption
            var brandLogo = new BrandLogo(13f)
            {
                Location = new Point(15, 10),
                BackColor = this.BackColor
            };
            brandLogo.Size = brandLogo.GetPreferredSize(Size.Empty);

            Label aiLabel = new Label
            {
                Text = "Settings",
                Location = new Point(15 + brandLogo.Width + 10, 15),
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(148, 163, 184),
                AutoSize = true
            };

            // Session Token section
            Label tokenSectionLabel = new Label
            {
                Text = "Session Token (from landsurv.ai)",
                Location = new Point(15, 45),
                Font = new Font("Segoe UI", 10, FontStyle.Bold),
                ForeColor = Color.FromArgb(226, 232, 240),
                AutoSize = true
            };

            Label helpText = new Label
            {
                Text = "Visit landsurv.ai → Connect Civil 3D to get your token",
                Location = new Point(15, 65),
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(148, 163, 184),
                AutoSize = true
            };

            sessionTokenInput = new TextBox
            {
                Location = new Point(15, 85),
                Size = new Size(475, 32),
                Font = new Font("Courier New", 10),
                BackColor = Color.FromArgb(30, 41, 59),
                ForeColor = Color.FromArgb(226, 232, 240),
                BorderStyle = BorderStyle.FixedSingle
            };

            // Info label
            Label infoLabel = new Label
            {
                Text = "Your API key is securely stored in landsurv.ai - chat will work automatically.",
                Location = new Point(15, 125),
                Width = 475,
                Height = 30,
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(148, 163, 184)
            };

            // Status label
            statusLabel = new Label
            {
                Text = "Ready",
                Location = new Point(15, 160),
                Font = new Font("Segoe UI", 9),
                ForeColor = Color.FromArgb(34, 197, 94),
                AutoSize = true
            };

            // Save button
            saveButton = new Button
            {
                Text = "Save",
                Location = new Point(340, 160),
                Width = 75,
                Height = 35,
                BackColor = Color.FromArgb(6, 182, 212), // Cyan
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 10, FontStyle.Bold)
            };
            saveButton.FlatAppearance.BorderSize = 0;
            saveButton.FlatAppearance.MouseOverBackColor = Color.FromArgb(34, 211, 238);
            saveButton.Click += SaveButton_Click;

            // Cancel button
            cancelButton = new Button
            {
                Text = "Cancel",
                Location = new Point(425, 160),
                Width = 65,
                Height = 35,
                BackColor = Color.FromArgb(51, 65, 85),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 10)
            };
            cancelButton.FlatAppearance.BorderSize = 0;
            cancelButton.FlatAppearance.MouseOverBackColor = Color.FromArgb(71, 85, 105);
            cancelButton.Click += (s, e) => { this.DialogResult = DialogResult.Cancel; this.Close(); };

            this.Controls.Add(brandLogo);
            this.Controls.Add(aiLabel);
            this.Controls.Add(tokenSectionLabel);
            this.Controls.Add(helpText);
            this.Controls.Add(sessionTokenInput);
            this.Controls.Add(infoLabel);
            this.Controls.Add(statusLabel);
            this.Controls.Add(saveButton);
            this.Controls.Add(cancelButton);
        }

        private void LoadCurrentSettings()
        {
            var config = ConfigurationManager.Instance;
            sessionTokenInput.Text = config.Get("SessionToken", "");
        }

        private void SaveButton_Click(object sender, EventArgs e)
        {
            string sessionToken = sessionTokenInput.Text.Trim().ToUpper();

            // Validate session token
            if (string.IsNullOrWhiteSpace(sessionToken))
            {
                statusLabel.Text = "Error: Session token is required";
                statusLabel.ForeColor = Color.FromArgb(239, 68, 68);
                return;
            }

            if (!sessionToken.StartsWith("LSC-") || sessionToken.Length != 15)
            {
                statusLabel.Text = "Error: Invalid token format (LSC-XXXXX-XXXXX)";
                statusLabel.ForeColor = Color.FromArgb(239, 68, 68);
                return;
            }

            // Save to local config
            var config = ConfigurationManager.Instance;
            config.Set("SessionToken", sessionToken);

            this.SessionToken = sessionToken;

            statusLabel.Text = "Settings saved successfully!";
            statusLabel.ForeColor = Color.FromArgb(34, 197, 94);

            System.Threading.Thread.Sleep(800);
            this.DialogResult = DialogResult.OK;
            this.Close();
        }

        public static string PromptForSessionToken(string currentToken = "")
        {
            using (SettingsForm form = new SettingsForm())
            {
                if (!string.IsNullOrEmpty(currentToken))
                {
                    form.sessionTokenInput.Text = currentToken;
                }

                if (form.ShowDialog() == DialogResult.OK)
                {
                    return form.SessionToken;
                }
                return null;
            }
        }
    }
}
