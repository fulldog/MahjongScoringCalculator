package store

import "testing"

func TestRawJSONScanCopiesBytes(t *testing.T) {
	src := []byte(`{"a":1}`)
	var got rawJSON
	if err := got.Scan(src); err != nil {
		t.Fatal(err)
	}
	src[2] = 'x'
	if string(got) != `{"a":1}` {
		t.Fatalf("got %s", got)
	}
}

func TestRawJSONScanNil(t *testing.T) {
	got := rawJSON(`x`)
	if err := got.Scan(nil); err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Fatalf("got %q", got)
	}
}
