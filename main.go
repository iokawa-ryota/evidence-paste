package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
    // 起動時の引数からポート番号を取得。指定がなければ8000を使う。
    port := "8000"
    if len(os.Args) > 1 {
        port = os.Args[1]
    }
    
    // 現在のディレクトリにあるファイルを公開するハンドラを設定
	http.Handle("/", http.FileServer(http.Dir(".")))
	
    addr := ":" + port
	log.Printf("Starting server on http://localhost%s\n", addr)
    // サーバーを起動
	log.Fatal(http.ListenAndServe(addr, nil))
}