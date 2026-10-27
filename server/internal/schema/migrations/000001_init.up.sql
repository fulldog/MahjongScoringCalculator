CREATE TABLE users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  openid VARCHAR(64) NOT NULL,
  nickname VARCHAR(64) NOT NULL DEFAULT '',
  avatar_url VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL,
  last_login_at DATETIME NOT NULL,
  UNIQUE KEY uniq_users_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE admins (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_admins_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE matches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(8) NOT NULL,
  host_user_id BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL,
  started_at DATETIME NULL,
  ended_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_matches_code (code),
  KEY idx_matches_status (status, created_at),
  KEY idx_matches_ended (ended_at),
  KEY idx_matches_host (host_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE match_seats (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  match_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  seat VARCHAR(8) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_match_seat (match_id, seat),
  UNIQUE KEY uniq_match_user (match_id, user_id),
  KEY idx_seats_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE rounds (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  match_id BIGINT NOT NULL,
  round_no INT NOT NULL,
  status VARCHAR(16) NOT NULL,
  kind VARCHAR(16) NOT NULL DEFAULT '',
  lines_json JSON NULL,
  created_at DATETIME NOT NULL,
  settled_at DATETIME NULL,
  UNIQUE KEY uniq_match_round (match_id, round_no),
  KEY idx_rounds_match (match_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE round_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  round_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  payload JSON NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uniq_round_user (round_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE round_deltas (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  round_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  delta INT NOT NULL,
  UNIQUE KEY uniq_delta_user (round_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE danmaku (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  match_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  guest_key VARCHAR(64) NOT NULL DEFAULT '',
  nickname VARCHAR(64) NOT NULL,
  content VARCHAR(128) NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_danmaku_match (match_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE minigame_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NULL,
  guest_key VARCHAR(64) NOT NULL DEFAULT '',
  game VARCHAR(32) NOT NULL,
  result VARCHAR(8) NOT NULL,
  score INT NOT NULL DEFAULT 0,
  level_no INT NOT NULL DEFAULT 0,
  stars INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY idx_mini_game_score (game, score),
  KEY idx_mini_user (user_id),
  KEY idx_mini_guest (guest_key),
  KEY idx_mini_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
