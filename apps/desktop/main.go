package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var appIcon []byte

func main() {
	service := NewAppService()
	app := application.New(application.Options{
		Name:        "SurveyController",
		Description: "SurveyController Desktop UI",
		Icon:        appIcon,
		Services: []application.Service{
			application.NewService(service),
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
		if service.consumeCloseConfirmed() {
			return
		}
		if !service.ShouldConfirmClose() {
			return
		}
		app.Event.Emit("surveycontroller:confirm-close", nil)
		event.Cancel()
	})
	window.Center()
	window.Show()

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
