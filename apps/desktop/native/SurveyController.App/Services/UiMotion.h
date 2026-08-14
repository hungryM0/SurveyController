#pragma once

#include "pch.h"

#include <unordered_map>

namespace winrt::SurveyController::App::Services
{
    inline bool AnimationsEnabled()
    {
        static Windows::UI::ViewManagement::UISettings settings;
        return settings.AnimationsEnabled();
    }

    inline void SetInfoBarOpen(Microsoft::UI::Xaml::Controls::InfoBar const& infoBar, bool open)
    {
        if (infoBar && infoBar.IsOpen() != open)
        {
            infoBar.IsOpen(open);
        }
    }

    namespace MotionDetail
    {
        struct VisibilityAnimation
        {
            uint64_t generation{};
            bool targetVisible{};
            Microsoft::UI::Xaml::Media::Animation::Storyboard storyboard{ nullptr };
        };

        inline auto& VisibilityAnimations()
        {
            static std::unordered_map<void*, VisibilityAnimation> animations;
            return animations;
        }

        inline uint64_t NextGeneration()
        {
            static uint64_t generation{};
            return ++generation;
        }

        inline void CancelVisibilityAnimation(void* key)
        {
            auto& animations = VisibilityAnimations();
            auto const current = animations.find(key);
            if (current == animations.end()) return;

            auto const storyboard = current->second.storyboard;
            animations.erase(current);
            storyboard.Stop();
        }
    }

    inline void SetVisibility(Microsoft::UI::Xaml::UIElement const& element, bool visible)
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Microsoft::UI::Xaml::Media::Animation;

        if (!element) return;

        auto const key = reinterpret_cast<void*>(winrt::get_abi(element));
        auto& animations = MotionDetail::VisibilityAnimations();
        auto const active = animations.find(key);
        if (active != animations.end() && active->second.targetVisible == visible) return;

        MotionDetail::CancelVisibilityAnimation(key);
        if (!AnimationsEnabled())
        {
            element.Opacity(1.0);
            element.Visibility(visible ? Visibility::Visible : Visibility::Collapsed);
            return;
        }

        if (visible && element.Visibility() == Visibility::Visible) return;
        if (!visible && element.Visibility() == Visibility::Collapsed) return;

        element.Opacity(1.0);
        if (visible)
        {
            element.Visibility(Visibility::Visible);
        }

        Storyboard storyboard;
        Timeline animation{ nullptr };
        if (visible)
        {
            animation = FadeInThemeAnimation{};
        }
        else
        {
            animation = FadeOutThemeAnimation{};
        }
        Storyboard::SetTarget(animation, element);
        storyboard.Children().Append(animation);

        auto const generation = MotionDetail::NextGeneration();
        auto const weakElement = winrt::make_weak(element);
        storyboard.Completed([key, generation, visible, weakElement](auto const&, auto const&)
        {
            auto& activeAnimations = MotionDetail::VisibilityAnimations();
            auto const current = activeAnimations.find(key);
            if (current == activeAnimations.end() || current->second.generation != generation) return;

            activeAnimations.erase(current);
            if (auto target = weakElement.get())
            {
                if (!visible)
                {
                    target.Visibility(Microsoft::UI::Xaml::Visibility::Collapsed);
                }
                target.Opacity(1.0);
            }
        });

        animations.emplace(key, MotionDetail::VisibilityAnimation{ generation, visible, storyboard });
        storyboard.Begin();
    }
}
