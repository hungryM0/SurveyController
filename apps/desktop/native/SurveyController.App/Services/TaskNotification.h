#pragma once

namespace winrt::SurveyController::App::Services
{
    class TaskNotification final
    {
    public:
        static TaskNotification& Current();

        bool Show(hstring const& title, hstring const& body) noexcept;
        ~TaskNotification();

        TaskNotification(TaskNotification const&) = delete;
        TaskNotification& operator=(TaskNotification const&) = delete;

    private:
        TaskNotification() = default;

        bool EnsureRegistered();

        bool m_registered{};
        event_token m_invokedToken{};
    };
}
