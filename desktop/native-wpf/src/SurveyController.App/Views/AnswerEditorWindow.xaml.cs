using System.Windows;
using System.Windows.Input;
using SurveyController.App.Services;
using SurveyController.Core.Document;

namespace SurveyController.App.Views;

/// <summary>
/// 逐题答案编辑器窗口：生命周期包裹一次 WizardDocument 编辑事务，
/// 保存提交、取消/ESC/直接关闭回滚。
/// </summary>
public partial class AnswerEditorWindow : Window
{
    private bool _committed;
    private bool _closing;
    private bool _aiSettingsOpen;

    public AnswerEditorWindow()
    {
        InitializeComponent();
        Owner = WindowContext.MainWindow;
        Document.BeginEditTransaction();
        Closed += (_, _) =>
        {
            if (!_committed)
            {
                Document.RollbackEditTransaction();
            }
        };
    }

    private WizardDocument Document { get; } = WizardDocument.Current;

    private void OnSave(object sender, RoutedEventArgs e)
    {
        if (Editor.SaveCurrentQuestion())
        {
            CloseEditor(commit: true);
        }
    }

    private void OnCancel(object sender, RoutedEventArgs e) => CloseEditor(commit: false);

    private async void OnOpenAISettings(object sender, RoutedEventArgs e)
    {
        if (_aiSettingsOpen)
        {
            return;
        }
        _aiSettingsOpen = true;
        try
        {
            await AISettingsDialog.ShowAsync();
        }
        catch
        {
        }
        _aiSettingsOpen = false;
    }

    private void OnKeyDown(object sender, KeyEventArgs args)
    {
        if (args.Key == Key.Escape)
        {
            args.Handled = true;
            CloseEditor(commit: false);
        }
    }

    private void CloseEditor(bool commit)
    {
        if (_closing)
        {
            return;
        }
        _closing = true;
        _committed = commit;
        if (commit)
        {
            Document.CommitEditTransaction();
        }
        else
        {
            Document.RollbackEditTransaction();
        }
        Close();
    }
}
