package main

import (
	"errors"
	"os"

	"github.com/BurntSushi/toml"
)

const (
	defaultConfigPath = "config.toml"
	exampleConfigPath = "config.example.toml"
)

type appConfig struct {
	AppPort int          `toml:"app_port"`
	OpenAI  openAIConfig `toml:"openai"`
}

type openAIConfig struct {
	APIKey  string `toml:"api_key"`
	Model   string `toml:"model"`
	BaseURL string `toml:"base_url"`
}

func loadConfig() (appConfig, error) {
	config := defaultAppConfig()

	path := os.Getenv("CONFIG_FILE")
	if path == "" {
		path = defaultConfigPath
	}

	if err := mergeConfigFile(path, &config); err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			return appConfig{}, err
		}
		if path != exampleConfigPath {
			if err := mergeConfigFile(exampleConfigPath, &config); err != nil && !errors.Is(err, os.ErrNotExist) {
				return appConfig{}, err
			}
		}
	}

	if config.AppPort == 0 {
		config.AppPort = 4827
	}
	if config.OpenAI.Model == "" {
		config.OpenAI.Model = "gpt-4.1-mini"
	}
	if config.OpenAI.BaseURL == "" {
		config.OpenAI.BaseURL = "https://api.openai.com/v1"
	}

	return config, nil
}

func mergeConfigFile(path string, config *appConfig) error {
	if _, err := toml.DecodeFile(path, config); err != nil {
		return err
	}
	return nil
}

func defaultAppConfig() appConfig {
	return appConfig{
		AppPort: 4827,
		OpenAI: openAIConfig{
			Model:   "gpt-4.1-mini",
			BaseURL: "https://api.openai.com/v1",
		},
	}
}
