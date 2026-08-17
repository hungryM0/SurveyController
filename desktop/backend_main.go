package main

import (
	"log"
	"os"

	desktoprpc "github.com/SurveyController/SurveyController/desktop/internal/rpc"
)

func main() {
	server := desktoprpc.NewServer(os.Stdin, os.Stdout, newRPCHandler(NewAppService()))
	if err := server.Serve(); err != nil {
		log.Printf("后端 RPC 退出: %v", err)
		os.Exit(1)
	}
}
