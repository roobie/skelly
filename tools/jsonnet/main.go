package main

import (
	"fmt"
	"os"

	jsonnet "github.com/google/go-jsonnet"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: jsonnet-eval <repository-root> <source.jsonnet>")
		os.Exit(2)
	}
	root, source := os.Args[1], os.Args[2]
	vm := jsonnet.MakeVM()
	vm.Importer(&jsonnet.FileImporter{JPaths: []string{root}})
	output, err := vm.EvaluateFile(source)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s: %v\n", source, err)
		os.Exit(1)
	}
	fmt.Print(output)
}
