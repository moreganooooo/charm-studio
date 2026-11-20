//go:build js

package tea

const suspendSupported = false

func suspendProcess()                                 {}
func (p *Program) listenForResize(done chan struct{}) { close(done) }
func (p *Program) initInput() error                   { return nil }
