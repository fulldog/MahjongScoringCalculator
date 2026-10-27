package wechat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

// Client exchanges a mini program login code for an openid.
type Client struct {
	appID  string
	secret string
	http   *http.Client
}

// New returns a WeChat client. An empty app ID enables local dev openids.
func New(appID, secret string) *Client {
	return &Client{
		appID:  appID,
		secret: secret,
		http:   &http.Client{Timeout: 5 * time.Second},
	}
}

// DevMode reports whether real jscode2session is skipped.
func (c *Client) DevMode() bool {
	return c.appID == "" || c.secret == ""
}

// OpenID resolves the WeChat user. In dev mode, stableID is used as-is.
func (c *Client) OpenID(ctx context.Context, code, stableID string) (string, error) {
	if c.DevMode() {
		if stableID != "" {
			return "dev:" + stableID, nil
		}
		if code != "" {
			return "dev:" + code, nil
		}
		return "", fmt.Errorf("缺少登录标识")
	}
	if code == "" {
		return "", fmt.Errorf("缺少登录 code")
	}
	query := url.Values{}
	query.Set("appid", c.appID)
	query.Set("secret", c.secret)
	query.Set("js_code", code)
	query.Set("grant_type", "authorization_code")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.weixin.qq.com/sns/jscode2session?"+query.Encode(), nil)
	if err != nil {
		return "", fmt.Errorf("build wechat request: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("call wechat: %w", err)
	}
	defer resp.Body.Close()
	var body struct {
		OpenID  string `json:"openid"`
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("decode wechat response: %w", err)
	}
	if body.ErrCode != 0 || body.OpenID == "" {
		return "", fmt.Errorf("微信登录失败")
	}
	return body.OpenID, nil
}
