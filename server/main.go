// Warranty receiver — a tiny LAN service that accepts case files from the
// mechanic's phone and stores them into a target folder for forwarding to the
// head office. Single static binary, cross-platform (Windows/macOS/Linux).
//
// Build:   go build -o warranty-receiver
// Run:     ./warranty-receiver -dir "/path/to/cases" -token "SECRET" -addr ":8080"
//
// REST contract (see ../docs/upload.md). Auth: Authorization: Bearer <token>.
//
// NOTE: v1 uses a bearer token over HTTP on a trusted LAN. TLS can be added
// later (serve with ListenAndServeTLS + a cert pinned in the app).
package main

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
)

// caseId / filename must be simple names (no path traversal).
var safeName = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)

type server struct {
	root  string
	token string
}

func main() {
	addr := flag.String("addr", ":8080", "listen address, e.g. :8080")
	dir := flag.String("dir", "", "target folder for received cases (required)")
	token := flag.String("token", "", "shared bearer token (required)")
	certFile := flag.String("cert", "", "TLS certificate (PEM); enables HTTPS when set with -key")
	keyFile := flag.String("key", "", "TLS private key (PEM)")
	flag.Parse()

	if *dir == "" || *token == "" {
		log.Fatal("both -dir and -token are required")
	}
	if err := os.MkdirAll(*dir, 0o755); err != nil {
		log.Fatalf("cannot create -dir: %v", err)
	}

	s := &server{root: *dir, token: *token}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", s.auth(s.handleHealth))
	mux.HandleFunc("POST /v1/cases/{caseId}/files", s.auth(s.handleFile))
	mux.HandleFunc("POST /v1/cases/{caseId}/complete", s.auth(s.handleComplete))

	tls := *certFile != "" && *keyFile != ""
	scheme := "http"
	if tls {
		scheme = "https"
	}
	log.Printf("warranty-receiver listening on %s (%s), saving to %s", *addr, scheme, *dir)
	if tls {
		log.Fatal(http.ListenAndServeTLS(*addr, *certFile, *keyFile, mux))
	} else {
		log.Fatal(http.ListenAndServe(*addr, mux))
	}
}

// auth wraps a handler with a constant-time bearer-token check.
func (s *server) auth(next http.HandlerFunc) http.HandlerFunc {
	want := "Bearer " + s.token
	return func(w http.ResponseWriter, r *http.Request) {
		got := r.Header.Get("Authorization")
		if subtle.ConstantTimeCompare([]byte(got), []byte(want)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	fmt.Fprintln(w, "ok")
}

// caseDir validates the caseId and returns its absolute folder, creating it.
func (s *server) caseDir(caseID string) (string, error) {
	if !safeName.MatchString(caseID) {
		return "", fmt.Errorf("invalid caseId")
	}
	dir := filepath.Join(s.root, caseID)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

func (s *server) handleFile(w http.ResponseWriter, r *http.Request) {
	caseID := r.PathValue("caseId")
	dir, err := s.caseDir(caseID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := r.ParseMultipartForm(64 << 20); err != nil { // 64 MB in memory, rest to temp
		log.Printf("REJECT %s: bad multipart form: %v", caseID, err)
		http.Error(w, "bad multipart form", http.StatusBadRequest)
		return
	}
	name := filepath.Base(r.FormValue("filename"))
	if !safeName.MatchString(name) {
		log.Printf("REJECT %s/%s: invalid filename", caseID, name)
		http.Error(w, "invalid filename", http.StatusBadRequest)
		return
	}
	// Declared file size (0 = unknown / skip the check).
	declaredSize, _ := strconv.ParseInt(r.FormValue("size"), 10, 64)

	file, _, err := r.FormFile("file")
	if err != nil {
		log.Printf("REJECT %s/%s: missing file part: %v", caseID, name, err)
		http.Error(w, "missing file part", http.StatusBadRequest)
		return
	}
	defer file.Close()

	dest := filepath.Join(dir, name)

	// Idempotency: skip if already stored (safe retries). Writes are atomic
	// (temp -> rename), so an existing file is always complete.
	if _, statErr := os.Stat(dest); statErr == nil {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "already stored")
		return
	}

	// Write atomically: temp file -> rename.
	tmp, err := os.CreateTemp(dir, ".upload-*")
	if err != nil {
		http.Error(w, "cannot create temp file", http.StatusInternalServerError)
		return
	}
	tmpName := tmp.Name()
	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(tmp, hasher), file)
	if err != nil {
		tmp.Close()
		os.Remove(tmpName)
		log.Printf("REJECT %s/%s: write failed: %v", caseID, name, err)
		http.Error(w, "write failed", http.StatusInternalServerError)
		return
	}
	tmp.Close()

	// Integrity: received byte count must match the declared size.
	if declaredSize > 0 && written != declaredSize {
		os.Remove(tmpName)
		log.Printf("REJECT %s/%s: size mismatch (want %d, got %d) — incomplete upload",
			caseID, name, declaredSize, written)
		http.Error(w, "size mismatch", http.StatusBadRequest)
		return
	}

	if err := os.Rename(tmpName, dest); err != nil {
		os.Remove(tmpName)
		http.Error(w, "cannot save file", http.StatusInternalServerError)
		return
	}

	log.Printf("stored %s/%s (%s)", caseID, name, hex.EncodeToString(hasher.Sum(nil))[:8])
	w.WriteHeader(http.StatusCreated)
	fmt.Fprintln(w, "stored")
}

func (s *server) handleComplete(w http.ResponseWriter, r *http.Request) {
	caseID := r.PathValue("caseId")
	dir, err := s.caseDir(caseID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		http.Error(w, "cannot read body", http.StatusBadRequest)
		return
	}
	if err := os.WriteFile(filepath.Join(dir, "session.json"), body, 0o644); err != nil {
		http.Error(w, "cannot write session.json", http.StatusInternalServerError)
		return
	}
	// Hook point: here you could notify the head-office forwarder / show a desktop alert.
	log.Printf("case %s completed", caseID)
	w.WriteHeader(http.StatusOK)
	fmt.Fprintln(w, "completed")
}
