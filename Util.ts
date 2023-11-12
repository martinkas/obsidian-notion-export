export function dateToString(date: Date): string {
	return `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
}

export function timeToString(time: Date): string {
	return `${time.getHours()}-${time.getMinutes()}-${time.getSeconds()}`;
}

export function dateTimeToString(dateTime: Date): string {
	return `${dateToString(dateTime)} ${timeToString(dateTime)}`;
}

export function isValidDate(dateString: any) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return regex.test(dateString);
}