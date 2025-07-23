CREATE DATABASE IF NOT EXISTS accommodations_app;

CREATE USER IF NOT EXISTS 'accommodationuser'@'%' IDENTIFIED BY 'accommodation';

GRANT ALL PRIVILEGES ON accommodations_app.* TO 'accommodationuser'@'%';

FLUSH PRIVILEGES;