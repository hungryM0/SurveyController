package main

import (
	"context"
	"embed"
	"log"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

const closeRequestedEvent = "surveycontroller:close-requested"

const closeShutdownTimeout = 5 * time.Second

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	service := NewAppService()
	windowService := &WindowService{}
	app := application.New(application.Options{
		Name:        "SurveyController",
		Description: "SurveyController Desktop UI",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(service),
			application.NewService(windowService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "SurveyController",
		Width:            1180,
		Height:           720,
		MinWidth:         900,
		MinHeight:        560,
		Frameless:        true,
		BackgroundType:   application.BackgroundTypeTranslucent,
		BackgroundColour: application.NewRGBA(0, 0, 0, 0),
		URL:              "/",
		Windows: application.WindowsWindow{
			BackdropType:                      application.Mica,
			DisableFramelessWindowDecorations: false,
		},
	})
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		allowClose := windowService.consumeCloseConfirmed()
		if !allowClose {
			settings, err := service.GetAppSettings()
			allowClose = err == nil && !settings.AskSaveOnClose
		}
		if allowClose {
			ctx, cancel := context.WithTimeout(context.Background(), closeShutdownTimeout)
			defer cancel()
			if err := service.runs.shutdown(ctx); err != nil {
				log.Printf("等待运行任务结束失败: %v", err)
			}
			return
		}
		event.Cancel()
		window.EmitEvent(closeRequestedEvent)
	})
	window.Center()
	window.Show()

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
