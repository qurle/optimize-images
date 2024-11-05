import { LOGS } from './code';

const progressBar = {
	count: 10,
	indicators: [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'],
	filled: `█`,
	empty: `░`
}


export function generateProgress(percent) {
	c(`Generating simple progress: ${percent}%`)
	const currentProgress = Math.floor(percent / progressBar.count)
	return progressBar.filled.repeat(currentProgress) + progressBar.empty.repeat(progressBar.count - currentProgress)
}


function c(str, error = false) {
	if (LOGS) {
		if (error)
			console.error(str)
		else
			console.log(str)
	}
}