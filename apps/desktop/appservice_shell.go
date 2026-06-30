package main

func (s *AppService) GetShellState() ShellState {
	return initialShellState(displayAppVersion())
}
