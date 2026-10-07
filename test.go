package main
import (
	"fmt"
	"io/ioutil"
	"net/http"
)
func main() {
	resp, _ := http.Get("http://10.244.0.8:8080/api/scale")
	body, _ := ioutil.ReadAll(resp.Body)
	fmt.Println(string(body))
}
