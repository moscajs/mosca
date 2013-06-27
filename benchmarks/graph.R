#! /usr/bin/env Rscript

args <- commandArgs(TRUE)
mosca <- read.csv(args[1])
mosquitto <- read.csv(args[2])
colors <- c("red", "blue")
lines <- c("solid", "solid")

dfrm <- data.frame(Mosca=mosca$sample,
                   Mosquitto=mosquitto$sample)

columns <- factor(colnames(dfrm))

quartz("QoS 1 unclean pub/sub latency on the same topic")
matplot(dfrm, type="l", pch=as.integer(columns),
        col=colors, lty=lines, ylim=c(0,3000), xlim=c(0,5000),
        main="QoS 1 unclean pub/sub latency on the same topic", xlab="Sample", ylab="Time (ms)")

grid()
legend(0, 3000,
       as.character(levels(columns)),
       col=colors, lty=lines)

dev.copy(pdf,args[3])
dev.off()

message("Press Return To Continue")
invisible(readLines("stdin", n=1))
