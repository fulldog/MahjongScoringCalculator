package store

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

// rawJSON copies MySQL JSON bytes. The driver buffer can be reused on the next row.
type rawJSON []byte

func (r *rawJSON) Scan(value any) error {
	if value == nil {
		*r = nil
		return nil
	}
	switch v := value.(type) {
	case []byte:
		*r = append([]byte(nil), v...)
		return nil
	case string:
		*r = []byte(v)
		return nil
	default:
		return fmt.Errorf("json column has type %T", value)
	}
}

func (r rawJSON) Value() (driver.Value, error) {
	if r == nil {
		return nil, nil
	}
	return []byte(r), nil
}

func jsonUnmarshal(payload rawJSON, dest any) error {
	if len(payload) == 0 {
		return nil
	}
	return json.Unmarshal([]byte(payload), dest)
}
