//go:build js

package clipboard

func readAll() (string, error)   { return "", nil }
func writeAll(text string) error { return nil }
