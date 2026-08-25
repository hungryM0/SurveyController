#pragma once

#include "AnswerEditorWindow.g.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct AnswerEditorWindow : AnswerEditorWindowT<AnswerEditorWindow>
    {
        AnswerEditorWindow();
        void Show(Microsoft::UI::WindowId owner);
        void OnSave(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnCancel(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnOpenAISettings(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnKeyDown(IInspectable const&, Microsoft::UI::Xaml::Input::KeyRoutedEventArgs const&);
        void SetClosedHandler(std::function<void(bool)> handler) { m_closedHandler = std::move(handler); }

    private:
        Services::WizardDocument& m_document;
        HWND m_hwnd{};
        bool m_committed{};
        bool m_closing{};
        bool m_confirmingClose{};
        bool m_aiSettingsOpen{};
        std::function<void(bool)> m_closedHandler;
        void ConfigureWindow(Microsoft::UI::WindowId owner);
        void CloseEditor(bool commit);
        winrt::fire_and_forget ConfirmCloseAsync();
        winrt::fire_and_forget ShowAISettingsAsync();
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct AnswerEditorWindow : AnswerEditorWindowT<AnswerEditorWindow, implementation::AnswerEditorWindow> {};
}
