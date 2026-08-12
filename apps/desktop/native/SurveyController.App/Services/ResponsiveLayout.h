#pragma once

namespace winrt::SurveyController::App::Services
{
    inline void ApplySettingsRows(winrt::Microsoft::UI::Xaml::DependencyObject const& root, bool compact)
    {
        using namespace winrt::Microsoft::UI::Xaml;
        using namespace winrt::Microsoft::UI::Xaml::Controls;
        using namespace winrt::Microsoft::UI::Xaml::Media;

        if (auto grid = root.try_as<Grid>())
        {
            auto columns = grid.ColumnDefinitions();
            if (columns.Size() == 3 && columns.GetAt(0).Width().GridUnitType == GridUnitType::Pixel &&
                columns.GetAt(0).Width().Value == 32)
            {
                auto children = grid.Children();
                if (compact)
                {
                    grid.RowDefinitions().Clear();
                    grid.RowDefinitions().Append(RowDefinition{});
                    grid.RowDefinitions().Append(RowDefinition{});
                    columns.GetAt(2).Width(GridLengthHelper::FromPixels(0));
                    if (children.Size() >= 3)
                    {
                        if (auto element = children.GetAt(2).try_as<FrameworkElement>())
                        {
                            Grid::SetColumn(element, 1);
                            Grid::SetRow(element, 1);
                            element.Margin(Thickness{ 0, 10, 0, 0 });
                            element.HorizontalAlignment(HorizontalAlignment::Left);
                        }
                    }
                }
                else
                {
                    grid.RowDefinitions().Clear();
                    columns.GetAt(2).Width(GridLengthHelper::Auto());
                    if (children.Size() >= 3)
                    {
                        if (auto element = children.GetAt(2).try_as<FrameworkElement>())
                        {
                            Grid::SetColumn(element, 2);
                            Grid::SetRow(element, 0);
                            element.Margin(Thickness{});
                            element.HorizontalAlignment(HorizontalAlignment::Stretch);
                        }
                    }
                }
            }
        }

        auto const count = VisualTreeHelper::GetChildrenCount(root);
        for (int32_t index = 0; index < count; ++index)
        {
            ApplySettingsRows(VisualTreeHelper::GetChild(root, index), compact);
        }
    }
}
