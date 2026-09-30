CREATE TABLE IF NOT EXISTS `agnt_staking_positions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`walletAddress` varchar(120) NOT NULL,
	`amount` int NOT NULL,
	`durationDays` int NOT NULL,
	`reward` decimal(12,2) NOT NULL,
	`status` enum('active','unstaked') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`unstakedAt` timestamp,
	CONSTRAINT `agnt_staking_positions_id` PRIMARY KEY(`id`)
);
