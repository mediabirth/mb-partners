-- サプライヤー招待統合（B）: 招待にレートカードを永続化（additive・メール素リンクでも確実に昇格）
alter table invites add column if not exists supplier_rate_card text;
